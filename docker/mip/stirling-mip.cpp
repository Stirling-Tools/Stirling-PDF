
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <exception>
#include <filesystem>
#include <future>
#include <iostream>
#include <map>
#include <memory>
#include <mutex>
#include <sstream>
#include <string>
#include <vector>

#include "mip/common_types.h"
#include "mip/diagnostic_configuration.h"
#include "mip/error.h"
#include "mip/file/file_engine.h"
#include "mip/file/file_handler.h"
#include "mip/file/file_profile.h"
#include "mip/file/file_status.h"
#include "mip/file/labeling_options.h"
#include "mip/file/protection_settings.h"
#include "mip/mip_configuration.h"
#include "mip/mip_context.h"
#include "mip/protection/protection_handler.h"
#include "mip/protection/rights.h"
#include "mip/protection_descriptor.h"
#include "mip/upe/content_label.h"
#include "mip/upe/label.h"

namespace fs = std::filesystem;

namespace {

std::mutex stdoutMutex;

std::string jsonEscape(const std::string& value) {
  std::string out;
  out.reserve(value.size() + 2);
  for (unsigned char c : value) {
    switch (c) {
      case '"': out += "\\\""; break;
      case '\\': out += "\\\\"; break;
      case '\n': out += "\\n"; break;
      case '\r': out += "\\r"; break;
      case '\t': out += "\\t"; break;
      default:
        if (c < 0x20) {
          char buffer[8];
          std::snprintf(buffer, sizeof(buffer), "\\u%04x", c);
          out += buffer;
        } else {
          out += static_cast<char>(c);
        }
    }
  }
  return out;
}

std::string jsonString(const std::string& value) { return "\"" + jsonEscape(value) + "\""; }

std::string stringArray(const std::vector<std::string>& values) {
  std::string out = "[";
  for (size_t i = 0; i < values.size(); ++i) {
    if (i > 0) out += ",";
    out += jsonString(values[i]);
  }
  return out + "]";
}

void emit(const std::string& jsonObject) {
  std::lock_guard<std::mutex> lock(stdoutMutex);
  std::cout << jsonObject << std::endl;
}

struct Options {
  std::string operation;
  std::map<std::string, std::string> values;

  const std::string& require(const std::string& name) const {
    auto found = values.find(name);
    if (found == values.end() || found->second.empty()) {
      throw std::invalid_argument("missing --" + name);
    }
    return found->second;
  }

  std::string get(const std::string& name, const std::string& fallback = "") const {
    auto found = values.find(name);
    return found == values.end() ? fallback : found->second;
  }
};

Options parse(int argc, char** argv) {
  if (argc < 2) throw std::invalid_argument("usage: stirling-mip <version|status|inspect|decrypt|protect> [--name value]...");
  Options options;
  options.operation = argv[1];
  for (int i = 2; i < argc; ++i) {
    std::string arg = argv[i];
    if (arg.rfind("--", 0) != 0 || i + 1 >= argc) throw std::invalid_argument("bad argument " + arg);
    options.values[arg.substr(2)] = argv[++i];
  }
  return options;
}

class StdioAuthDelegate final : public mip::AuthDelegate {
 public:
  bool AcquireOAuth2Token(
      const mip::Identity&, const OAuth2Challenge& challenge, OAuth2Token& token) override {
    std::lock_guard<std::mutex> lock(requestMutex);
    emit("{\"type\":\"token_request\",\"authority\":" + jsonString(challenge.GetAuthority()) +
         ",\"resource\":" + jsonString(challenge.GetResource()) +
         ",\"scope\":" + jsonString(challenge.GetScope()) +
         ",\"claims\":" + jsonString(challenge.GetClaims()) + "}");
    std::string reply;
    if (!std::getline(std::cin, reply)) {
      token.SetErrorMessage("token channel closed");
      return false;
    }
    if (reply.rfind("OK ", 0) == 0) {
      token.SetAccessToken(reply.substr(3));
      return true;
    }
    token.SetErrorMessage(reply.rfind("ERR ", 0) == 0 ? reply.substr(4) : reply);
    return false;
  }

 private:
  std::mutex requestMutex;
};

class AcceptingConsentDelegate final : public mip::ConsentDelegate {
 public:
  mip::Consent GetUserConsent(const std::string&) override { return mip::Consent::AcceptAlways; }
};

class ProfileObserver final : public mip::FileProfile::Observer {
 public:
  void OnLoadSuccess(const std::shared_ptr<mip::FileProfile>& profile, const std::shared_ptr<void>& context) override {
    std::static_pointer_cast<std::promise<std::shared_ptr<mip::FileProfile>>>(context)->set_value(profile);
  }
  void OnLoadFailure(const std::exception_ptr& error, const std::shared_ptr<void>& context) override {
    std::static_pointer_cast<std::promise<std::shared_ptr<mip::FileProfile>>>(context)->set_exception(error);
  }
  void OnAddEngineSuccess(const std::shared_ptr<mip::FileEngine>& engine, const std::shared_ptr<void>& context) override {
    std::static_pointer_cast<std::promise<std::shared_ptr<mip::FileEngine>>>(context)->set_value(engine);
  }
  void OnAddEngineFailure(const std::exception_ptr& error, const std::shared_ptr<void>& context) override {
    std::static_pointer_cast<std::promise<std::shared_ptr<mip::FileEngine>>>(context)->set_exception(error);
  }
};

class HandlerObserver final : public mip::FileHandler::Observer {
 public:
  void OnCreateFileHandlerSuccess(const std::shared_ptr<mip::FileHandler>& handler, const std::shared_ptr<void>& context) override {
    std::static_pointer_cast<std::promise<std::shared_ptr<mip::FileHandler>>>(context)->set_value(handler);
  }
  void OnCreateFileHandlerFailure(const std::exception_ptr& error, const std::shared_ptr<void>& context) override {
    std::static_pointer_cast<std::promise<std::shared_ptr<mip::FileHandler>>>(context)->set_exception(error);
  }
  void OnGetDecryptedTemporaryFileSuccess(const std::string& path, const std::shared_ptr<void>& context) override {
    std::static_pointer_cast<std::promise<std::string>>(context)->set_value(path);
  }
  void OnGetDecryptedTemporaryFileFailure(const std::exception_ptr& error, const std::shared_ptr<void>& context) override {
    std::static_pointer_cast<std::promise<std::string>>(context)->set_exception(error);
  }
  void OnCommitSuccess(bool committed, const std::shared_ptr<void>& context) override {
    std::static_pointer_cast<std::promise<bool>>(context)->set_value(committed);
  }
  void OnCommitFailure(const std::exception_ptr& error, const std::shared_ptr<void>& context) override {
    std::static_pointer_cast<std::promise<bool>>(context)->set_exception(error);
  }
};

std::shared_ptr<mip::MipContext> createContext(const Options& options, const std::string& stateDir) {
  mip::ApplicationInfo appInfo{
      options.get("client-id", "00000000-0000-0000-0000-000000000000"),
      options.get("app-name", "Stirling-PDF"),
      options.get("app-version", "0")};
  auto configuration = std::make_shared<mip::MipConfiguration>(
      appInfo, stateDir, mip::LogLevel::Warning, false, mip::CacheStorageType::InMemory);
  auto diagnostics = std::make_shared<mip::DiagnosticConfiguration>();
  diagnostics->isMinimalTelemetryEnabled = true;
  configuration->SetDiagnosticConfiguration(diagnostics);
  return mip::MipContext::Create(configuration);
}

struct Session {
  std::shared_ptr<mip::MipContext> context;
  std::shared_ptr<mip::FileProfile> profile;
  std::shared_ptr<mip::FileEngine> engine;
};

Session openSession(const Options& options) {
  std::string stateDir = options.require("state-dir");
  fs::create_directories(stateDir);
  Session session;
  session.context = createContext(options, stateDir);

  auto profileObserver = std::make_shared<ProfileObserver>();
  mip::FileProfile::Settings profileSettings(
      session.context, mip::CacheStorageType::InMemory,
      std::make_shared<AcceptingConsentDelegate>(), profileObserver);
  auto profilePromise = std::make_shared<std::promise<std::shared_ptr<mip::FileProfile>>>();
  auto profileFuture = profilePromise->get_future();
  mip::FileProfile::LoadAsync(profileSettings, profilePromise);
  session.profile = profileFuture.get();

  mip::FileEngine::Settings engineSettings(
      mip::Identity(options.require("user")), std::make_shared<StdioAuthDelegate>(), "", "en-US");
  engineSettings.SetEngineId(options.require("engine-id"));
  auto enginePromise = std::make_shared<std::promise<std::shared_ptr<mip::FileEngine>>>();
  auto engineFuture = enginePromise->get_future();
  session.profile->AddEngineAsync(engineSettings, enginePromise);
  session.engine = engineFuture.get();
  return session;
}

std::shared_ptr<mip::FileHandler> openHandler(const Session& session, const std::string& path) {
  auto promise = std::make_shared<std::promise<std::shared_ptr<mip::FileHandler>>>();
  auto future = promise->get_future();
  session.engine->CreateFileHandlerAsync(path, path, true, std::make_shared<HandlerObserver>(), promise);
  return future.get();
}

bool commit(const std::shared_ptr<mip::FileHandler>& handler, const std::string& output) {
  auto promise = std::make_shared<std::promise<bool>>();
  auto future = promise->get_future();
  handler->CommitAsync(output, promise);
  return future.get();
}

long long epochSeconds(std::chrono::time_point<std::chrono::system_clock> time) {
  return std::chrono::duration_cast<std::chrono::seconds>(time.time_since_epoch()).count();
}

std::string describeLabel(const std::shared_ptr<mip::FileHandler>& handler) {
  auto contentLabel = handler->GetLabel();
  if (!contentLabel || !contentLabel->GetLabel()) return "null";
  auto label = contentLabel->GetLabel();
  std::string parentName;
  if (auto parent = label->GetParent().lock()) parentName = parent->GetName();
  return "{\"id\":" + jsonString(label->GetId()) + ",\"name\":" + jsonString(label->GetName()) +
         ",\"parentName\":" + jsonString(parentName) + ",\"color\":" + jsonString(label->GetColor()) +
         ",\"sensitivity\":" + std::to_string(label->GetSensitivity()) + "}";
}

std::string describeProtection(const std::shared_ptr<mip::ProtectionHandler>& protection) {
  if (!protection) return "null";
  std::string out = "{\"rights\":" + stringArray(protection->GetRights()) +
                    ",\"owner\":" + jsonString(protection->GetOwner()) +
                    ",\"issuedTo\":" + jsonString(protection->GetIssuedTo()) +
                    ",\"isIssuedToOwner\":" + (protection->IsIssuedToOwner() ? "true" : "false") +
                    ",\"contentId\":" + jsonString(protection->GetContentId());
  if (auto descriptor = protection->GetProtectionDescriptor()) {
    out += ",\"templateId\":" + jsonString(descriptor->GetTemplateId()) +
           ",\"name\":" + jsonString(descriptor->GetName()) +
           ",\"allowOfflineAccess\":" + (descriptor->DoesAllowOfflineAccess() ? "true" : "false");
    long long validUntil = epochSeconds(descriptor->GetContentValidUntil());
    if (validUntil > 0) out += ",\"validUntil\":" + std::to_string(validUntil);
  }
  return out + "}";
}

std::string describe(const std::shared_ptr<mip::FileHandler>& handler) {
  return "\"label\":" + describeLabel(handler) + ",\"protection\":" + describeProtection(handler->GetProtection());
}

void requireRight(const std::shared_ptr<mip::ProtectionHandler>& protection, const std::string& right) {
  if (!protection->AccessCheck(right) && !protection->AccessCheck(mip::rights::Owner())) {
    throw mip::AccessDeniedError("Your permissions on this document do not include " + right);
  }
}

void runVersion() {
  emit("{\"type\":\"result\",\"version\":" + jsonString(mip::FileProfile::GetVersion()) + "}");
}

void runStatus(const Options& options) {
  std::string stateDir = options.require("state-dir");
  fs::create_directories(stateDir);
  auto context = createContext(options, stateDir);
  auto status = mip::FileHandler::GetFileStatus(options.require("input"), context);
  emit(std::string("{\"type\":\"result\",\"protected\":") + (status->IsProtected() ? "true" : "false") +
       ",\"labeled\":" + (status->IsLabeled() ? "true" : "false") + "}");
  context->ShutDown();
}

void runInspect(const Options& options) {
  Session session = openSession(options);
  auto handler = openHandler(session, options.require("input"));
  emit("{\"type\":\"result\"," + describe(handler) + "}");
  session.context->ShutDown();
}

void runDecrypt(const Options& options) {
  Session session = openSession(options);
  auto handler = openHandler(session, options.require("input"));
  auto protection = handler->GetProtection();
  if (!protection) throw mip::BadInputError("The document is not protected");
  requireRight(protection, mip::rights::View());

  auto promise = std::make_shared<std::promise<std::string>>();
  auto future = promise->get_future();
  handler->GetDecryptedTemporaryFileAsync(promise);
  std::string decrypted = future.get();
  fs::copy_file(decrypted, options.require("output"), fs::copy_options::overwrite_existing);
  std::error_code ignored;
  fs::remove(decrypted, ignored);
  emit("{\"type\":\"result\"," + describe(handler) + "}");
  session.context->ShutDown();
}

void runProtect(const Options& options) {
  Session session = openSession(options);
  auto original = openHandler(session, options.require("original"));
  auto protection = original->GetProtection();
  if (!protection) throw mip::BadInputError("The original document is not protected");
  requireRight(protection, mip::rights::Edit());

  auto derived = openHandler(session, options.require("input"));
  auto contentLabel = original->GetLabel();
  if (contentLabel && contentLabel->GetLabel()) {
    mip::LabelingOptions labeling(mip::AssignmentMethod::PRIVILEGED);
    derived->SetLabel(contentLabel->GetLabel(), labeling, mip::ProtectionSettings());
  }
  derived->SetProtection(protection);
  if (!commit(derived, options.require("output"))) throw mip::InternalError("The SDK did not write the protected document");
  emit("{\"type\":\"result\"," + describe(original) + "}");
  session.context->ShutDown();
}

std::string errorCode(const std::exception_ptr& error, std::string& message, std::string& owner) {
  try {
    std::rethrow_exception(error);
  } catch (const mip::NoPermissionsError& e) {
    message = e.what();
    owner = e.GetOwner();
    return "no_permissions";
  } catch (const mip::NoAuthTokenError& e) {
    message = e.what();
    return "sign_in_required";
  } catch (const mip::ServiceDisabledError& e) {
    message = e.what();
    return "service_disabled";
  } catch (const mip::CustomerKeyUnavailableError& e) {
    message = e.what();
    return "key_unavailable";
  } catch (const mip::AccessDeniedError& e) {
    message = e.what();
    return "access_denied";
  } catch (const mip::NetworkError& e) {
    message = e.what();
    return "network";
  } catch (const mip::ConsentDeniedError& e) {
    message = e.what();
    return "consent_denied";
  } catch (const mip::NotSupportedError& e) {
    message = e.what();
    return "not_supported";
  } catch (const mip::BadInputError& e) {
    message = e.what();
    return "bad_input";
  } catch (const std::exception& e) {
    message = e.what();
    return "failed";
  } catch (...) {
    message = "unknown native error";
    return "failed";
  }
}

}

int main(int argc, char** argv) {
  try {
    Options options = parse(argc, argv);
    if (options.operation == "version") runVersion();
    else if (options.operation == "status") runStatus(options);
    else if (options.operation == "inspect") runInspect(options);
    else if (options.operation == "decrypt") runDecrypt(options);
    else if (options.operation == "protect") runProtect(options);
    else throw std::invalid_argument("unknown operation " + options.operation);
    return 0;
  } catch (...) {
    std::string message;
    std::string owner;
    std::string code = errorCode(std::current_exception(), message, owner);
    emit("{\"type\":\"error\",\"code\":" + jsonString(code) + ",\"message\":" + jsonString(message) +
         ",\"owner\":" + jsonString(owner) + "}");
    return 1;
  }
}
