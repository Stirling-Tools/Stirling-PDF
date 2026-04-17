Name:           stirling-pdf
Version:        %{version}
Release:        1%{?dist}
Summary:        Locally hosted web-based PDF manipulation tool

License:        MIT AND LicenseRef-Stirling-PDF-Proprietary
# Full license: https://github.com/Stirling-Tools/Stirling-PDF/blob/main/LICENSE
URL:            https://github.com/Stirling-Tools/Stirling-PDF
Source0:        https://github.com/Stirling-Tools/Stirling-PDF/releases/download/v%{version}/Stirling-PDF-%{version}.jar
Source1:        https://github.com/Stirling-Tools/Stirling-PDF/raw/v%{version}/manifests/systemd/stirling-pdf.service
Source2:        https://github.com/Stirling-Tools/Stirling-PDF/raw/v%{version}/manifests/systemd/stirling-pdf.conf

BuildArch:      noarch
BuildRequires:  systemd-rpm-macros

Requires:       java-25-openjdk-headless
Requires(pre):  shadow-utils

%description
Stirling-PDF is a locally hosted, web-based PDF manipulation tool.
It lets you carry out various operations on PDF files, including splitting,
merging, converting, reorganising, image extraction, rotating, compressing
and more.

%prep
# Nothing to unpack for a pre-built JAR

%build
# Nothing to build

%install
install -D -m 0644 %{SOURCE0} %{buildroot}%{_datadir}/stirling-pdf/stirling-pdf.jar
install -D -m 0644 %{SOURCE1} %{buildroot}%{_unitdir}/stirling-pdf.service
install -D -m 0640 %{SOURCE2} %{buildroot}%{_sysconfdir}/stirling-pdf/stirling-pdf.conf

# Working / data directories
install -d %{buildroot}%{_localstatedir}/lib/stirling-pdf
install -d %{buildroot}%{_localstatedir}/log/stirling-pdf

%pre
getent group stirling-pdf >/dev/null || groupadd -r stirling-pdf
getent passwd stirling-pdf >/dev/null || \
  useradd -r -g stirling-pdf -d %{_localstatedir}/lib/stirling-pdf \
          -s /sbin/nologin -c "Stirling-PDF service account" stirling-pdf

%post
%systemd_post stirling-pdf.service

%preun
%systemd_preun stirling-pdf.service

%postun
%systemd_postun_with_restart stirling-pdf.service

%files
%{_datadir}/stirling-pdf/stirling-pdf.jar
%{_unitdir}/stirling-pdf.service
%config(noreplace) %{_sysconfdir}/stirling-pdf/stirling-pdf.conf
%attr(750,stirling-pdf,stirling-pdf) %{_localstatedir}/lib/stirling-pdf
%attr(750,stirling-pdf,stirling-pdf) %{_localstatedir}/log/stirling-pdf

%changelog
* Wed Mar 26 2025 Anthony Stirling <contact@stirlingpdf.com> - %{version}-1
- Initial packaging
