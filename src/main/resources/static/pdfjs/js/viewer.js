/**
 * @licstart The following is the entire license notice for the
 * JavaScript code in this page
 *
 * Copyright 2023 Mozilla Foundation
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 * @licend The above is the entire license notice for the
 * JavaScript code in this page
 */

/******/
(() => { // webpackBootstrap
    /******/
    "use strict";
    /******/
    var __webpack_modules__ = ([
        /* 0 */,
        /* 1 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.GenericCom = void 0;
            var _app = __webpack_require__(2);
            var _preferences = __webpack_require__(42);
            var _download_manager = __webpack_require__(43);
            var _genericl10n = __webpack_require__(44);
            var _generic_scripting = __webpack_require__(46);
            ;
            const GenericCom = {};
            exports.GenericCom = GenericCom;

            class GenericPreferences extends _preferences.BasePreferences {
                async _writeToStorage(prefObj) {
                    localStorage.setItem("pdfjs.preferences", JSON.stringify(prefObj));
                }

                async _readFromStorage(prefObj) {
                    return JSON.parse(localStorage.getItem("pdfjs.preferences"));
                }
            }

            class GenericExternalServices extends _app.DefaultExternalServices {
                static createDownloadManager() {
                    return new _download_manager.DownloadManager();
                }

                static createPreferences() {
                    return new GenericPreferences();
                }

                static createL10n({
                                      locale = "en-US"
                                  }) {
                    return new _genericl10n.GenericL10n(locale);
                }

                static createScripting({
                                           sandboxBundleSrc
                                       }) {
                    return new _generic_scripting.GenericScripting(sandboxBundleSrc);
                }
            }

            _app.PDFViewerApplication.externalServices = GenericExternalServices;

            /***/
        }),
        /* 2 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PDFViewerApplication = exports.PDFPrintServiceFactory = exports.DefaultExternalServices = void 0;
            var _ui_utils = __webpack_require__(3);
            var _pdfjsLib = __webpack_require__(4);
            var _app_options = __webpack_require__(5);
            var _event_utils = __webpack_require__(6);
            var _pdf_link_service = __webpack_require__(7);
            var _webAlt_text_manager = __webpack_require__(8);
            var _webAnnotation_editor_params = __webpack_require__(9);
            var _overlay_manager = __webpack_require__(10);
            var _password_prompt = __webpack_require__(11);
            var _webPdf_attachment_viewer = __webpack_require__(12);
            var _webPdf_cursor_tools = __webpack_require__(14);
            var _webPdf_document_properties = __webpack_require__(16);
            var _webPdf_find_bar = __webpack_require__(17);
            var _pdf_find_controller = __webpack_require__(18);
            var _pdf_history = __webpack_require__(20);
            var _webPdf_layer_viewer = __webpack_require__(21);
            var _webPdf_outline_viewer = __webpack_require__(22);
            var _webPdf_presentation_mode = __webpack_require__(23);
            var _pdf_rendering_queue = __webpack_require__(24);
            var _pdf_scripting_manager = __webpack_require__(25);
            var _webPdf_sidebar = __webpack_require__(26);
            var _webPdf_thumbnail_viewer = __webpack_require__(27);
            var _pdf_viewer = __webpack_require__(29);
            var _webSecondary_toolbar = __webpack_require__(39);
            var _webToolbar = __webpack_require__(40);
            var _view_history = __webpack_require__(41);
            const FORCE_PAGES_LOADED_TIMEOUT = 10000;
            const WHEEL_ZOOM_DISABLED_TIMEOUT = 1000;
            const ViewOnLoad = {
                UNKNOWN: -1,
                PREVIOUS: 0,
                INITIAL: 1
            };
            const ViewerCssTheme = {
                AUTOMATIC: 0,
                LIGHT: 1,
                DARK: 2
            };

            class DefaultExternalServices {
                constructor() {
                    throw new Error("Cannot initialize DefaultExternalServices.");
                }

                static updateFindControlState(data) {
                }

                static updateFindMatchesCount(data) {
                }

                static initPassiveLoading(callbacks) {
                }

                static reportTelemetry(data) {
                }

                static createDownloadManager() {
                    throw new Error("Not implemented: createDownloadManager");
                }

                static createPreferences() {
                    throw new Error("Not implemented: createPreferences");
                }

                static createL10n(options) {
                    throw new Error("Not implemented: createL10n");
                }

                static createScripting(options) {
                    throw new Error("Not implemented: createScripting");
                }

                static get supportsPinchToZoom() {
                    return (0, _pdfjsLib.shadow)(this, "supportsPinchToZoom", true);
                }

                static get supportsIntegratedFind() {
                    return (0, _pdfjsLib.shadow)(this, "supportsIntegratedFind", false);
                }

                static get supportsDocumentFonts() {
                    return (0, _pdfjsLib.shadow)(this, "supportsDocumentFonts", true);
                }

                static get supportedMouseWheelZoomModifierKeys() {
                    return (0, _pdfjsLib.shadow)(this, "supportedMouseWheelZoomModifierKeys", {
                        ctrlKey: true,
                        metaKey: true
                    });
                }

                static get isInAutomation() {
                    return (0, _pdfjsLib.shadow)(this, "isInAutomation", false);
                }

                static updateEditorStates(data) {
                    throw new Error("Not implemented: updateEditorStates");
                }

                static get canvasMaxAreaInBytes() {
                    return (0, _pdfjsLib.shadow)(this, "canvasMaxAreaInBytes", -1);
                }

                static getNimbusExperimentData() {
                    return (0, _pdfjsLib.shadow)(this, "getNimbusExperimentData", Promise.resolve(null));
                }
            }

            exports.DefaultExternalServices = DefaultExternalServices;
            const PDFViewerApplication = {
                initialBookmark: document.location.hash.substring(1),
                _initializedCapability: new _pdfjsLib.PromiseCapability(),
                appConfig: null,
                pdfDocument: null,
                pdfLoadingTask: null,
                printService: null,
                pdfViewer: null,
                pdfThumbnailViewer: null,
                pdfRenderingQueue: null,
                pdfPresentationMode: null,
                pdfDocumentProperties: null,
                pdfLinkService: null,
                pdfHistory: null,
                pdfSidebar: null,
                pdfOutlineViewer: null,
                pdfAttachmentViewer: null,
                pdfLayerViewer: null,
                pdfCursorTools: null,
                pdfScriptingManager: null,
                store: null,
                downloadManager: null,
                overlayManager: null,
                preferences: null,
                toolbar: null,
                secondaryToolbar: null,
                eventBus: null,
                l10n: null,
                annotationEditorParams: null,
                isInitialViewSet: false,
                downloadComplete: false,
                isViewerEmbedded: window.parent !== window,
                url: "",
                baseUrl: "",
                _downloadUrl: "",
                externalServices: DefaultExternalServices,
                _boundEvents: Object.create(null),
                documentInfo: null,
                metadata: null,
                _contentDispositionFilename: null,
                _contentLength: null,
                _saveInProgress: false,
                _wheelUnusedTicks: 0,
                _wheelUnusedFactor: 1,
                _touchUnusedTicks: 0,
                _touchUnusedFactor: 1,
                _PDFBug: null,
                _hasAnnotationEditors: false,
                _title: document.title,
                _printAnnotationStoragePromise: null,
                _touchInfo: null,
                _isCtrlKeyDown: false,
                _nimbusDataPromise: null,
                async initialize(appConfig) {
                    this.preferences = this.externalServices.createPreferences();
                    this.appConfig = appConfig;
                    await this._initializeOptions();
                    this._forceCssTheme();
                    await this._initializeL10n();
                    if (this.isViewerEmbedded && _app_options.AppOptions.get("externalLinkTarget") === _pdf_link_service.LinkTarget.NONE) {
                        _app_options.AppOptions.set("externalLinkTarget", _pdf_link_service.LinkTarget.TOP);
                    }
                    await this._initializeViewerComponents();
                    this.bindEvents();
                    this.bindWindowEvents();
                    const appContainer = appConfig.appContainer || document.documentElement;
                    this.l10n.translate(appContainer).then(() => {
                        this.eventBus.dispatch("localized", {
                            source: this
                        });
                    });
                    this._initializedCapability.resolve();
                },
                async _initializeOptions() {
                    if (_app_options.AppOptions.get("disablePreferences")) {
                        if (_app_options.AppOptions.get("pdfBugEnabled")) {
                            await this._parseHashParams();
                        }
                        return;
                    }
                    if (_app_options.AppOptions._hasUserOptions()) {
                        console.warn("_initializeOptions: The Preferences may override manually set AppOptions; " + 'please use the "disablePreferences"-option in order to prevent that.');
                    }
                    try {
                        _app_options.AppOptions.setAll(await this.preferences.getAll());
                    } catch (reason) {
                        console.error(`_initializeOptions: "${reason.message}".`);
                    }
                    if (_app_options.AppOptions.get("pdfBugEnabled")) {
                        await this._parseHashParams();
                    }
                },
                async _parseHashParams() {
                    const hash = document.location.hash.substring(1);
                    if (!hash) {
                        return;
                    }
                    const {
                            mainContainer,
                            viewerContainer
                        } = this.appConfig,
                        params = (0, _ui_utils.parseQueryString)(hash);
                    if (params.get("disableworker") === "true") {
                        try {
                            await loadFakeWorker();
                        } catch (ex) {
                            console.error(`_parseHashParams: "${ex.message}".`);
                        }
                    }
                    if (params.has("disablerange")) {
                        _app_options.AppOptions.set("disableRange", params.get("disablerange") === "true");
                    }
                    if (params.has("disablestream")) {
                        _app_options.AppOptions.set("disableStream", params.get("disablestream") === "true");
                    }
                    if (params.has("disableautofetch")) {
                        _app_options.AppOptions.set("disableAutoFetch", params.get("disableautofetch") === "true");
                    }
                    if (params.has("disablefontface")) {
                        _app_options.AppOptions.set("disableFontFace", params.get("disablefontface") === "true");
                    }
                    if (params.has("disablehistory")) {
                        _app_options.AppOptions.set("disableHistory", params.get("disablehistory") === "true");
                    }
                    if (params.has("verbosity")) {
                        _app_options.AppOptions.set("verbosity", params.get("verbosity") | 0);
                    }
                    if (params.has("textlayer")) {
                        switch (params.get("textlayer")) {
                            case "off":
                                _app_options.AppOptions.set("textLayerMode", _ui_utils.TextLayerMode.DISABLE);
                                break;
                            case "visible":
                            case "shadow":
                            case "hover":
                                viewerContainer.classList.add(`textLayer-${params.get("textlayer")}`);
                                try {
                                    await loadPDFBug(this);
                                    this._PDFBug.loadCSS();
                                } catch (ex) {
                                    console.error(`_parseHashParams: "${ex.message}".`);
                                }
                                break;
                        }
                    }
                    if (params.has("pdfbug")) {
                        _app_options.AppOptions.set("pdfBug", true);
                        _app_options.AppOptions.set("fontExtraProperties", true);
                        const enabled = params.get("pdfbug").split(",");
                        try {
                            await loadPDFBug(this);
                            this._PDFBug.init(mainContainer, enabled);
                        } catch (ex) {
                            console.error(`_parseHashParams: "${ex.message}".`);
                        }
                    }
                    if (params.has("locale")) {
                        _app_options.AppOptions.set("locale", params.get("locale"));
                    }
                },
                async _initializeL10n() {
                    this.l10n = this.externalServices.createL10n({
                        locale: _app_options.AppOptions.get("locale")
                    });
                    const dir = await this.l10n.getDirection();
                    document.getElementsByTagName("html")[0].dir = dir;
                },
                _forceCssTheme() {
                    const cssTheme = _app_options.AppOptions.get("viewerCssTheme");
                    if (cssTheme === ViewerCssTheme.AUTOMATIC || !Object.values(ViewerCssTheme).includes(cssTheme)) {
                        return;
                    }
                    try {
                        const styleSheet = document.styleSheets[0];
                        const cssRules = styleSheet?.cssRules || [];
                        for (let i = 0, ii = cssRules.length; i < ii; i++) {
                            const rule = cssRules[i];
                            if (rule instanceof CSSMediaRule && rule.media?.[0] === "(prefers-color-scheme: dark)") {
                                if (cssTheme === ViewerCssTheme.LIGHT) {
                                    styleSheet.deleteRule(i);
                                    return;
                                }
                                const darkRules = /^@media \(prefers-color-scheme: dark\) {\n\s*([\w\s-.,:;/\\{}()]+)\n}$/.exec(rule.cssText);
                                if (darkRules?.[1]) {
                                    styleSheet.deleteRule(i);
                                    styleSheet.insertRule(darkRules[1], i);
                                }
                                return;
                            }
                        }
                    } catch (reason) {
                        console.error(`_forceCssTheme: "${reason?.message}".`);
                    }
                },
                async _initializeViewerComponents() {
                    const {
                        appConfig,
                        externalServices,
                        l10n
                    } = this;
                    const eventBus = externalServices.isInAutomation ? new _event_utils.AutomationEventBus() : new _event_utils.EventBus();
                    this.eventBus = eventBus;
                    this.overlayManager = new _overlay_manager.OverlayManager();
                    const pdfRenderingQueue = new _pdf_rendering_queue.PDFRenderingQueue();
                    pdfRenderingQueue.onIdle = this._cleanup.bind(this);
                    this.pdfRenderingQueue = pdfRenderingQueue;
                    const pdfLinkService = new _pdf_link_service.PDFLinkService({
                        eventBus,
                        externalLinkTarget: _app_options.AppOptions.get("externalLinkTarget"),
                        externalLinkRel: _app_options.AppOptions.get("externalLinkRel"),
                        ignoreDestinationZoom: _app_options.AppOptions.get("ignoreDestinationZoom")
                    });
                    this.pdfLinkService = pdfLinkService;
                    const downloadManager = externalServices.createDownloadManager();
                    this.downloadManager = downloadManager;
                    const findController = new _pdf_find_controller.PDFFindController({
                        linkService: pdfLinkService,
                        eventBus,
                        updateMatchesCountOnProgress: true
                    });
                    this.findController = findController;
                    const pdfScriptingManager = new _pdf_scripting_manager.PDFScriptingManager({
                        eventBus,
                        sandboxBundleSrc: _app_options.AppOptions.get("sandboxBundleSrc"),
                        externalServices,
                        docProperties: this._scriptingDocProperties.bind(this)
                    });
                    this.pdfScriptingManager = pdfScriptingManager;
                    const container = appConfig.mainContainer,
                        viewer = appConfig.viewerContainer;
                    const annotationEditorMode = _app_options.AppOptions.get("annotationEditorMode");
                    const isOffscreenCanvasSupported = _app_options.AppOptions.get("isOffscreenCanvasSupported") && _pdfjsLib.FeatureTest.isOffscreenCanvasSupported;
                    const pageColors = _app_options.AppOptions.get("forcePageColors") || window.matchMedia("(forced-colors: active)").matches ? {
                        background: _app_options.AppOptions.get("pageColorsBackground"),
                        foreground: _app_options.AppOptions.get("pageColorsForeground")
                    } : null;
                    const altTextManager = appConfig.altTextDialog ? new _webAlt_text_manager.AltTextManager(appConfig.altTextDialog, container, this.overlayManager, eventBus) : null;
                    const pdfViewer = new _pdf_viewer.PDFViewer({
                        container,
                        viewer,
                        eventBus,
                        renderingQueue: pdfRenderingQueue,
                        linkService: pdfLinkService,
                        downloadManager,
                        altTextManager,
                        findController,
                        scriptingManager: _app_options.AppOptions.get("enableScripting") && pdfScriptingManager,
                        l10n,
                        textLayerMode: _app_options.AppOptions.get("textLayerMode"),
                        annotationMode: _app_options.AppOptions.get("annotationMode"),
                        annotationEditorMode,
                        imageResourcesPath: _app_options.AppOptions.get("imageResourcesPath"),
                        enablePrintAutoRotate: _app_options.AppOptions.get("enablePrintAutoRotate"),
                        isOffscreenCanvasSupported,
                        maxCanvasPixels: _app_options.AppOptions.get("maxCanvasPixels"),
                        enablePermissions: _app_options.AppOptions.get("enablePermissions"),
                        pageColors
                    });
                    this.pdfViewer = pdfViewer;
                    pdfRenderingQueue.setViewer(pdfViewer);
                    pdfLinkService.setViewer(pdfViewer);
                    pdfScriptingManager.setViewer(pdfViewer);
                    if (appConfig.sidebar?.thumbnailView) {
                        this.pdfThumbnailViewer = new _webPdf_thumbnail_viewer.PDFThumbnailViewer({
                            container: appConfig.sidebar.thumbnailView,
                            eventBus,
                            renderingQueue: pdfRenderingQueue,
                            linkService: pdfLinkService,
                            l10n,
                            pageColors
                        });
                        pdfRenderingQueue.setThumbnailViewer(this.pdfThumbnailViewer);
                    }
                    if (!this.isViewerEmbedded && !_app_options.AppOptions.get("disableHistory")) {
                        this.pdfHistory = new _pdf_history.PDFHistory({
                            linkService: pdfLinkService,
                            eventBus
                        });
                        pdfLinkService.setHistory(this.pdfHistory);
                    }
                    if (!this.supportsIntegratedFind && appConfig.findBar) {
                        this.findBar = new _webPdf_find_bar.PDFFindBar(appConfig.findBar, eventBus, l10n);
                    }
                    if (appConfig.annotationEditorParams) {
                        if (annotationEditorMode !== _pdfjsLib.AnnotationEditorType.DISABLE) {
                            if (_app_options.AppOptions.get("enableStampEditor") && isOffscreenCanvasSupported) {
                                appConfig.toolbar?.editorStampButton?.classList.remove("hidden");
                            }
                            this.annotationEditorParams = new _webAnnotation_editor_params.AnnotationEditorParams(appConfig.annotationEditorParams, eventBus);
                        } else {
                            for (const id of ["editorModeButtons", "editorModeSeparator"]) {
                                document.getElementById(id)?.classList.add("hidden");
                            }
                        }
                    }
                    if (appConfig.documentProperties) {
                        this.pdfDocumentProperties = new _webPdf_document_properties.PDFDocumentProperties(appConfig.documentProperties, this.overlayManager, eventBus, l10n, () => this._docFilename);
                    }
                    if (appConfig.secondaryToolbar?.cursorHandToolButton) {
                        this.pdfCursorTools = new _webPdf_cursor_tools.PDFCursorTools({
                            container,
                            eventBus,
                            cursorToolOnLoad: _app_options.AppOptions.get("cursorToolOnLoad")
                        });
                    }
                    if (appConfig.toolbar) {
                        this.toolbar = new _webToolbar.Toolbar(appConfig.toolbar, eventBus, l10n);
                    }
                    if (appConfig.secondaryToolbar) {
                        this.secondaryToolbar = new _webSecondary_toolbar.SecondaryToolbar(appConfig.secondaryToolbar, eventBus);
                    }
                    if (this.supportsFullscreen && appConfig.secondaryToolbar?.presentationModeButton) {
                        this.pdfPresentationMode = new _webPdf_presentation_mode.PDFPresentationMode({
                            container,
                            pdfViewer,
                            eventBus
                        });
                    }
                    if (appConfig.passwordOverlay) {
                        this.passwordPrompt = new _password_prompt.PasswordPrompt(appConfig.passwordOverlay, this.overlayManager, l10n, this.isViewerEmbedded);
                    }
                    if (appConfig.sidebar?.outlineView) {
                        this.pdfOutlineViewer = new _webPdf_outline_viewer.PDFOutlineViewer({
                            container: appConfig.sidebar.outlineView,
                            eventBus,
                            linkService: pdfLinkService,
                            downloadManager
                        });
                    }
                    if (appConfig.sidebar?.attachmentsView) {
                        this.pdfAttachmentViewer = new _webPdf_attachment_viewer.PDFAttachmentViewer({
                            container: appConfig.sidebar.attachmentsView,
                            eventBus,
                            downloadManager
                        });
                    }
                    if (appConfig.sidebar?.layersView) {
                        this.pdfLayerViewer = new _webPdf_layer_viewer.PDFLayerViewer({
                            container: appConfig.sidebar.layersView,
                            eventBus,
                            l10n
                        });
                    }
                    if (appConfig.sidebar) {
                        this.pdfSidebar = new _webPdf_sidebar.PDFSidebar({
                            elements: appConfig.sidebar,
                            eventBus,
                            l10n
                        });
                        this.pdfSidebar.onToggled = this.forceRendering.bind(this);
                        this.pdfSidebar.onUpdateThumbnails = () => {
                            for (const pageView of pdfViewer.getCachedPageViews()) {
                                if (pageView.renderingState === _ui_utils.RenderingStates.FINISHED) {
                                    this.pdfThumbnailViewer.getThumbnail(pageView.id - 1)?.setImage(pageView);
                                }
                            }
                            this.pdfThumbnailViewer.scrollThumbnailIntoView(pdfViewer.currentPageNumber);
                        };
                    }
                },
                async run(config) {
                    await this.initialize(config);
                    const {
                        appConfig,
                        eventBus
                    } = this;
                    let file;
                    const queryString = document.location.search.substring(1);
                    const params = (0, _ui_utils.parseQueryString)(queryString);
                    file = params.get("file") ?? _app_options.AppOptions.get("defaultUrl");
                    validateFileURL(file);
                    const fileInput = appConfig.openFileInput;
                    fileInput.value = null;
                    fileInput.addEventListener("change", function (evt) {
                        const {
                            files
                        } = evt.target;
                        if (!files || files.length === 0) {
                            return;
                        }
                        eventBus.dispatch("fileinputchange", {
                            source: this,
                            fileInput: evt.target
                        });
                    });
                    appConfig.mainContainer.addEventListener("dragover", function (evt) {
                        evt.preventDefault();
                        evt.dataTransfer.dropEffect = evt.dataTransfer.effectAllowed === "copy" ? "copy" : "move";
                    });
                    appConfig.mainContainer.addEventListener("drop", function (evt) {
                        evt.preventDefault();
                        const {
                            files
                        } = evt.dataTransfer;
                        if (!files || files.length === 0) {
                            return;
                        }
                        eventBus.dispatch("fileinputchange", {
                            source: this,
                            fileInput: evt.dataTransfer
                        });
                    });
                    if (!this.supportsDocumentFonts) {
                        _app_options.AppOptions.set("disableFontFace", true);
                        this.l10n.get("web_fonts_disabled").then(msg => {
                            console.warn(msg);
                        });
                    }
                    if (!this.supportsPrinting) {
                        appConfig.toolbar?.print?.classList.add("hidden");
                        appConfig.secondaryToolbar?.printButton.classList.add("hidden");
                    }
                    if (!this.supportsFullscreen) {
                        appConfig.secondaryToolbar?.presentationModeButton.classList.add("hidden");
                    }
                    if (this.supportsIntegratedFind) {
                        appConfig.toolbar?.viewFind?.classList.add("hidden");
                    }
                    appConfig.mainContainer.addEventListener("transitionend", function (evt) {
                        if (evt.target === this) {
                            eventBus.dispatch("resize", {
                                source: this
                            });
                        }
                    }, true);
                    if (file) {
                        this.open({
                            url: file
                        });
                    } else {
                        this._hideViewBookmark();
                    }
                },
                get initialized() {
                    return this._initializedCapability.settled;
                },
                get initializedPromise() {
                    return this._initializedCapability.promise;
                },
                zoomIn(steps, scaleFactor) {
                    if (this.pdfViewer.isInPresentationMode) {
                        return;
                    }
                    this.pdfViewer.increaseScale({
                        drawingDelay: _app_options.AppOptions.get("defaultZoomDelay"),
                        steps,
                        scaleFactor
                    });
                },
                zoomOut(steps, scaleFactor) {
                    if (this.pdfViewer.isInPresentationMode) {
                        return;
                    }
                    this.pdfViewer.decreaseScale({
                        drawingDelay: _app_options.AppOptions.get("defaultZoomDelay"),
                        steps,
                        scaleFactor
                    });
                },
                zoomReset() {
                    if (this.pdfViewer.isInPresentationMode) {
                        return;
                    }
                    this.pdfViewer.currentScaleValue = _ui_utils.DEFAULT_SCALE_VALUE;
                },
                get pagesCount() {
                    return this.pdfDocument ? this.pdfDocument.numPages : 0;
                },
                get page() {
                    return this.pdfViewer.currentPageNumber;
                },
                set page(val) {
                    this.pdfViewer.currentPageNumber = val;
                },
                get supportsPrinting() {
                    return PDFPrintServiceFactory.instance.supportsPrinting;
                },
                get supportsFullscreen() {
                    return (0, _pdfjsLib.shadow)(this, "supportsFullscreen", document.fullscreenEnabled);
                },
                get supportsPinchToZoom() {
                    return this.externalServices.supportsPinchToZoom;
                },
                get supportsIntegratedFind() {
                    return this.externalServices.supportsIntegratedFind;
                },
                get supportsDocumentFonts() {
                    return this.externalServices.supportsDocumentFonts;
                },
                get loadingBar() {
                    const barElement = document.getElementById("loadingBar");
                    const bar = barElement ? new _ui_utils.ProgressBar(barElement) : null;
                    return (0, _pdfjsLib.shadow)(this, "loadingBar", bar);
                },
                get supportedMouseWheelZoomModifierKeys() {
                    return this.externalServices.supportedMouseWheelZoomModifierKeys;
                },
                initPassiveLoading(file) {
                    throw new Error("Not implemented: initPassiveLoading");
                },
                setTitleUsingUrl(url = "", downloadUrl = null) {
                    this.url = url;
                    this.baseUrl = url.split("#")[0];
                    if (downloadUrl) {
                        this._downloadUrl = downloadUrl === url ? this.baseUrl : downloadUrl.split("#")[0];
                    }
                    if ((0, _pdfjsLib.isDataScheme)(url)) {
                        this._hideViewBookmark();
                    }
                    let title = (0, _pdfjsLib.getPdfFilenameFromUrl)(url, "");
                    if (!title) {
                        try {
                            title = decodeURIComponent((0, _pdfjsLib.getFilenameFromUrl)(url)) || url;
                        } catch {
                            title = url;
                        }
                    }
                    this.setTitle(title);
                },
                setTitle(title = this._title) {
                    this._title = title;
                    if (this.isViewerEmbedded) {
                        return;
                    }
                    const editorIndicator = this._hasAnnotationEditors && !this.pdfRenderingQueue.printing;
                    document.title = `${editorIndicator ? "* " : ""}${title}`;
                },
                get _docFilename() {
                    return this._contentDispositionFilename || (0, _pdfjsLib.getPdfFilenameFromUrl)(this.url);
                },
                _hideViewBookmark() {
                    const {
                        secondaryToolbar
                    } = this.appConfig;
                    secondaryToolbar?.viewBookmarkButton.classList.add("hidden");
                    if (secondaryToolbar?.presentationModeButton.classList.contains("hidden")) {
                        document.getElementById("viewBookmarkSeparator")?.classList.add("hidden");
                    }
                },
                async close() {
                    this._unblockDocumentLoadEvent();
                    this._hideViewBookmark();
                    if (!this.pdfLoadingTask) {
                        return;
                    }
                    if (this.pdfDocument?.annotationStorage.size > 0 && this._annotationStorageModified) {
                        try {
                            await this.save();
                        } catch {
                        }
                    }
                    const promises = [];
                    promises.push(this.pdfLoadingTask.destroy());
                    this.pdfLoadingTask = null;
                    if (this.pdfDocument) {
                        this.pdfDocument = null;
                        this.pdfThumbnailViewer?.setDocument(null);
                        this.pdfViewer.setDocument(null);
                        this.pdfLinkService.setDocument(null);
                        this.pdfDocumentProperties?.setDocument(null);
                    }
                    this.pdfLinkService.externalLinkEnabled = true;
                    this.store = null;
                    this.isInitialViewSet = false;
                    this.downloadComplete = false;
                    this.url = "";
                    this.baseUrl = "";
                    this._downloadUrl = "";
                    this.documentInfo = null;
                    this.metadata = null;
                    this._contentDispositionFilename = null;
                    this._contentLength = null;
                    this._saveInProgress = false;
                    this._hasAnnotationEditors = false;
                    promises.push(this.pdfScriptingManager.destroyPromise, this.passwordPrompt.close());
                    this.setTitle();
                    this.pdfSidebar?.reset();
                    this.pdfOutlineViewer?.reset();
                    this.pdfAttachmentViewer?.reset();
                    this.pdfLayerViewer?.reset();
                    this.pdfHistory?.reset();
                    this.findBar?.reset();
                    this.toolbar?.reset();
                    this.secondaryToolbar?.reset();
                    this._PDFBug?.cleanup();
                    await Promise.all(promises);
                },
                async open(args) {
                    let deprecatedArgs = false;
                    if (typeof args === "string") {
                        args = {
                            url: args
                        };
                        deprecatedArgs = true;
                    } else if (args?.byteLength) {
                        args = {
                            data: args
                        };
                        deprecatedArgs = true;
                    }
                    if (deprecatedArgs) {
                        console.error("The `PDFViewerApplication.open` signature was updated, please use an object instead.");
                    }
                    if (this.pdfLoadingTask) {
                        await this.close();
                    }
                    const workerParams = _app_options.AppOptions.getAll(_app_options.OptionKind.WORKER);
                    Object.assign(_pdfjsLib.GlobalWorkerOptions, workerParams);
                    if (args.url) {
                        this.setTitleUsingUrl(args.originalUrl || args.url, args.url);
                    }
                    const apiParams = _app_options.AppOptions.getAll(_app_options.OptionKind.API);
                    const params = {
                        canvasMaxAreaInBytes: this.externalServices.canvasMaxAreaInBytes,
                        ...apiParams,
                        ...args
                    };
                    const loadingTask = (0, _pdfjsLib.getDocument)(params);
                    this.pdfLoadingTask = loadingTask;
                    loadingTask.onPassword = (updateCallback, reason) => {
                        if (this.isViewerEmbedded) {
                            this._unblockDocumentLoadEvent();
                        }
                        this.pdfLinkService.externalLinkEnabled = false;
                        this.passwordPrompt.setUpdateCallback(updateCallback, reason);
                        this.passwordPrompt.open();
                    };
                    loadingTask.onProgress = ({
                                                  loaded,
                                                  total
                                              }) => {
                        this.progress(loaded / total);
                    };
                    return loadingTask.promise.then(pdfDocument => {
                        this.load(pdfDocument);
                    }, reason => {
                        if (loadingTask !== this.pdfLoadingTask) {
                            return undefined;
                        }
                        let key = "loading_error";
                        if (reason instanceof _pdfjsLib.InvalidPDFException) {
                            key = "invalid_file_error";
                        } else if (reason instanceof _pdfjsLib.MissingPDFException) {
                            key = "missing_file_error";
                        } else if (reason instanceof _pdfjsLib.UnexpectedResponseException) {
                            key = "unexpected_response_error";
                        }
                        return this.l10n.get(key).then(msg => {
                            this._documentError(msg, {
                                message: reason?.message
                            });
                            throw reason;
                        });
                    });
                },
                _ensureDownloadComplete() {
                    if (this.pdfDocument && this.downloadComplete) {
                        return;
                    }
                    throw new Error("PDF document not downloaded.");
                },
                async download(options = {}) {
                    const url = this._downloadUrl,
                        filename = this._docFilename;
                    try {
                        this._ensureDownloadComplete();
                        const data = await this.pdfDocument.getData();
                        const blob = new Blob([data], {
                            type: "application/pdf"
                        });
                        await this.downloadManager.download(blob, url, filename, options);
                    } catch {
                        await this.downloadManager.downloadUrl(url, filename, options);
                    }
                },
                async save(options = {}) {
                    if (this._saveInProgress) {
                        return;
                    }
                    this._saveInProgress = true;
                    await this.pdfScriptingManager.dispatchWillSave();
                    const url = this._downloadUrl,
                        filename = this._docFilename;
                    try {
                        this._ensureDownloadComplete();
                        const data = await this.pdfDocument.saveDocument();
                        const blob = new Blob([data], {
                            type: "application/pdf"
                        });
                        await this.downloadManager.download(blob, url, filename, options);
                    } catch (reason) {
                        console.error(`Error when saving the document: ${reason.message}`);
                        await this.download(options);
                    } finally {
                        await this.pdfScriptingManager.dispatchDidSave();
                        this._saveInProgress = false;
                    }
                    if (this._hasAnnotationEditors) {
                        this.externalServices.reportTelemetry({
                            type: "editing",
                            data: {
                                type: "save"
                            }
                        });
                    }
                },
                downloadOrSave(options = {}) {
                    if (this.pdfDocument?.annotationStorage.size > 0) {
                        this.save(options);
                    } else {
                        this.download(options);
                    }
                },
                openInExternalApp() {
                    this.downloadOrSave({
                        openInExternalApp: true
                    });
                },
                _documentError(message, moreInfo = null) {
                    this._unblockDocumentLoadEvent();
                    this._otherError(message, moreInfo);
                    this.eventBus.dispatch("documenterror", {
                        source: this,
                        message,
                        reason: moreInfo?.message ?? null
                    });
                },
                _otherError(message, moreInfo = null) {
                    const moreInfoText = [`PDF.js v${_pdfjsLib.version || "?"} (build: ${_pdfjsLib.build || "?"})`];
                    if (moreInfo) {
                        moreInfoText.push(`Message: ${moreInfo.message}`);
                        if (moreInfo.stack) {
                            moreInfoText.push(`Stack: ${moreInfo.stack}`);
                        } else {
                            if (moreInfo.filename) {
                                moreInfoText.push(`File: ${moreInfo.filename}`);
                            }
                            if (moreInfo.lineNumber) {
                                moreInfoText.push(`Line: ${moreInfo.lineNumber}`);
                            }
                        }
                    }
                    console.error(`${message}\n\n${moreInfoText.join("\n")}`);
                },
                progress(level) {
                    if (!this.loadingBar || this.downloadComplete) {
                        return;
                    }
                    const percent = Math.round(level * 100);
                    if (percent <= this.loadingBar.percent) {
                        return;
                    }
                    this.loadingBar.percent = percent;
                    if (this.pdfDocument?.loadingParams.disableAutoFetch ?? _app_options.AppOptions.get("disableAutoFetch")) {
                        this.loadingBar.setDisableAutoFetch();
                    }
                },
                load(pdfDocument) {
                    this.pdfDocument = pdfDocument;
                    pdfDocument.getDownloadInfo().then(({
                                                            length
                                                        }) => {
                        this._contentLength = length;
                        this.downloadComplete = true;
                        this.loadingBar?.hide();
                        firstPagePromise.then(() => {
                            this.eventBus.dispatch("documentloaded", {
                                source: this
                            });
                        });
                    });
                    const pageLayoutPromise = pdfDocument.getPageLayout().catch(() => {
                    });
                    const pageModePromise = pdfDocument.getPageMode().catch(() => {
                    });
                    const openActionPromise = pdfDocument.getOpenAction().catch(() => {
                    });
                    this.toolbar?.setPagesCount(pdfDocument.numPages, false);
                    this.secondaryToolbar?.setPagesCount(pdfDocument.numPages);
                    this.pdfLinkService.setDocument(pdfDocument);
                    this.pdfDocumentProperties?.setDocument(pdfDocument);
                    const pdfViewer = this.pdfViewer;
                    pdfViewer.setDocument(pdfDocument);
                    const {
                        firstPagePromise,
                        onePageRendered,
                        pagesPromise
                    } = pdfViewer;
                    this.pdfThumbnailViewer?.setDocument(pdfDocument);
                    const storedPromise = (this.store = new _view_history.ViewHistory(pdfDocument.fingerprints[0])).getMultiple({
                        page: null,
                        zoom: _ui_utils.DEFAULT_SCALE_VALUE,
                        scrollLeft: "0",
                        scrollTop: "0",
                        rotation: null,
                        sidebarView: _ui_utils.SidebarView.UNKNOWN,
                        scrollMode: _ui_utils.ScrollMode.UNKNOWN,
                        spreadMode: _ui_utils.SpreadMode.UNKNOWN
                    }).catch(() => {
                    });
                    firstPagePromise.then(pdfPage => {
                        this.loadingBar?.setWidth(this.appConfig.viewerContainer);
                        this._initializeAnnotationStorageCallbacks(pdfDocument);
                        Promise.all([_ui_utils.animationStarted, storedPromise, pageLayoutPromise, pageModePromise, openActionPromise]).then(async ([timeStamp, stored, pageLayout, pageMode, openAction]) => {
                            const viewOnLoad = _app_options.AppOptions.get("viewOnLoad");
                            this._initializePdfHistory({
                                fingerprint: pdfDocument.fingerprints[0],
                                viewOnLoad,
                                initialDest: openAction?.dest
                            });
                            const initialBookmark = this.initialBookmark;
                            const zoom = _app_options.AppOptions.get("defaultZoomValue");
                            let hash = zoom ? `zoom=${zoom}` : null;
                            let rotation = null;
                            let sidebarView = _app_options.AppOptions.get("sidebarViewOnLoad");
                            let scrollMode = _app_options.AppOptions.get("scrollModeOnLoad");
                            let spreadMode = _app_options.AppOptions.get("spreadModeOnLoad");
                            if (stored?.page && viewOnLoad !== ViewOnLoad.INITIAL) {
                                hash = `page=${stored.page}&zoom=${zoom || stored.zoom},` + `${stored.scrollLeft},${stored.scrollTop}`;
                                rotation = parseInt(stored.rotation, 10);
                                if (sidebarView === _ui_utils.SidebarView.UNKNOWN) {
                                    sidebarView = stored.sidebarView | 0;
                                }
                                if (scrollMode === _ui_utils.ScrollMode.UNKNOWN) {
                                    scrollMode = stored.scrollMode | 0;
                                }
                                if (spreadMode === _ui_utils.SpreadMode.UNKNOWN) {
                                    spreadMode = stored.spreadMode | 0;
                                }
                            }
                            if (pageMode && sidebarView === _ui_utils.SidebarView.UNKNOWN) {
                                sidebarView = (0, _ui_utils.apiPageModeToSidebarView)(pageMode);
                            }
                            if (pageLayout && scrollMode === _ui_utils.ScrollMode.UNKNOWN && spreadMode === _ui_utils.SpreadMode.UNKNOWN) {
                                const modes = (0, _ui_utils.apiPageLayoutToViewerModes)(pageLayout);
                                spreadMode = modes.spreadMode;
                            }
                            this.setInitialView(hash, {
                                rotation,
                                sidebarView,
                                scrollMode,
                                spreadMode
                            });
                            this.eventBus.dispatch("documentinit", {
                                source: this
                            });
                            if (!this.isViewerEmbedded) {
                                pdfViewer.focus();
                            }
                            await Promise.race([pagesPromise, new Promise(resolve => {
                                setTimeout(resolve, FORCE_PAGES_LOADED_TIMEOUT);
                            })]);
                            if (!initialBookmark && !hash) {
                                return;
                            }
                            if (pdfViewer.hasEqualPageSizes) {
                                return;
                            }
                            this.initialBookmark = initialBookmark;
                            pdfViewer.currentScaleValue = pdfViewer.currentScaleValue;
                            this.setInitialView(hash);
                        }).catch(() => {
                            this.setInitialView();
                        }).then(function () {
                            pdfViewer.update();
                        });
                    });
                    pagesPromise.then(() => {
                        this._unblockDocumentLoadEvent();
                        this._initializeAutoPrint(pdfDocument, openActionPromise);
                    }, reason => {
                        this.l10n.get("loading_error").then(msg => {
                            this._documentError(msg, {
                                message: reason?.message
                            });
                        });
                    });
                    onePageRendered.then(data => {
                        this.externalServices.reportTelemetry({
                            type: "pageInfo",
                            timestamp: data.timestamp
                        });
                        if (this.pdfOutlineViewer) {
                            pdfDocument.getOutline().then(outline => {
                                if (pdfDocument !== this.pdfDocument) {
                                    return;
                                }
                                this.pdfOutlineViewer.render({
                                    outline,
                                    pdfDocument
                                });
                            });
                        }
                        if (this.pdfAttachmentViewer) {
                            pdfDocument.getAttachments().then(attachments => {
                                if (pdfDocument !== this.pdfDocument) {
                                    return;
                                }
                                this.pdfAttachmentViewer.render({
                                    attachments
                                });
                            });
                        }
                        if (this.pdfLayerViewer) {
                            pdfViewer.optionalContentConfigPromise.then(optionalContentConfig => {
                                if (pdfDocument !== this.pdfDocument) {
                                    return;
                                }
                                this.pdfLayerViewer.render({
                                    optionalContentConfig,
                                    pdfDocument
                                });
                            });
                        }
                    });
                    this._initializePageLabels(pdfDocument);
                    this._initializeMetadata(pdfDocument);
                },
                async _scriptingDocProperties(pdfDocument) {
                    if (!this.documentInfo) {
                        await new Promise(resolve => {
                            this.eventBus._on("metadataloaded", resolve, {
                                once: true
                            });
                        });
                        if (pdfDocument !== this.pdfDocument) {
                            return null;
                        }
                    }
                    if (!this._contentLength) {
                        await new Promise(resolve => {
                            this.eventBus._on("documentloaded", resolve, {
                                once: true
                            });
                        });
                        if (pdfDocument !== this.pdfDocument) {
                            return null;
                        }
                    }
                    return {
                        ...this.documentInfo,
                        baseURL: this.baseUrl,
                        filesize: this._contentLength,
                        filename: this._docFilename,
                        metadata: this.metadata?.getRaw(),
                        authors: this.metadata?.get("dc:creator"),
                        numPages: this.pagesCount,
                        URL: this.url
                    };
                },
                async _initializeAutoPrint(pdfDocument, openActionPromise) {
                    const [openAction, jsActions] = await Promise.all([openActionPromise, this.pdfViewer.enableScripting ? null : pdfDocument.getJSActions()]);
                    if (pdfDocument !== this.pdfDocument) {
                        return;
                    }
                    let triggerAutoPrint = openAction?.action === "Print";
                    if (jsActions) {
                        console.warn("Warning: JavaScript support is not enabled");
                        for (const name in jsActions) {
                            if (triggerAutoPrint) {
                                break;
                            }
                            switch (name) {
                                case "WillClose":
                                case "WillSave":
                                case "DidSave":
                                case "WillPrint":
                                case "DidPrint":
                                    continue;
                            }
                            triggerAutoPrint = jsActions[name].some(js => _ui_utils.AutoPrintRegExp.test(js));
                        }
                    }
                    if (triggerAutoPrint) {
                        this.triggerPrinting();
                    }
                },
                async _initializeMetadata(pdfDocument) {
                    const {
                        info,
                        metadata,
                        contentDispositionFilename,
                        contentLength
                    } = await pdfDocument.getMetadata();
                    if (pdfDocument !== this.pdfDocument) {
                        return;
                    }
                    this.documentInfo = info;
                    this.metadata = metadata;
                    this._contentDispositionFilename ??= contentDispositionFilename;
                    this._contentLength ??= contentLength;
                    console.log(`PDF ${pdfDocument.fingerprints[0]} [${info.PDFFormatVersion} ` + `${(info.Producer || "-").trim()} / ${(info.Creator || "-").trim()}] ` + `(PDF.js: ${_pdfjsLib.version || "?"} [${_pdfjsLib.build || "?"}])`);
                    let pdfTitle = info.Title;
                    const metadataTitle = metadata?.get("dc:title");
                    if (metadataTitle) {
                        if (metadataTitle !== "Untitled" && !/[\uFFF0-\uFFFF]/g.test(metadataTitle)) {
                            pdfTitle = metadataTitle;
                        }
                    }
                    if (pdfTitle) {
                        this.setTitle(`${pdfTitle} - ${this._contentDispositionFilename || this._title}`);
                    } else if (this._contentDispositionFilename) {
                        this.setTitle(this._contentDispositionFilename);
                    }
                    if (info.IsXFAPresent && !info.IsAcroFormPresent && !pdfDocument.isPureXfa) {
                        if (pdfDocument.loadingParams.enableXfa) {
                            console.warn("Warning: XFA Foreground documents are not supported");
                        } else {
                            console.warn("Warning: XFA support is not enabled");
                        }
                    } else if ((info.IsAcroFormPresent || info.IsXFAPresent) && !this.pdfViewer.renderForms) {
                        console.warn("Warning: Interactive form support is not enabled");
                    }
                    if (info.IsSignaturesPresent) {
                        console.warn("Warning: Digital signatures validation is not supported");
                    }
                    this.eventBus.dispatch("metadataloaded", {
                        source: this
                    });
                },
                async _initializePageLabels(pdfDocument) {
                    const labels = await pdfDocument.getPageLabels();
                    if (pdfDocument !== this.pdfDocument) {
                        return;
                    }
                    if (!labels || _app_options.AppOptions.get("disablePageLabels")) {
                        return;
                    }
                    const numLabels = labels.length;
                    let standardLabels = 0,
                        emptyLabels = 0;
                    for (let i = 0; i < numLabels; i++) {
                        const label = labels[i];
                        if (label === (i + 1).toString()) {
                            standardLabels++;
                        } else if (label === "") {
                            emptyLabels++;
                        } else {
                            break;
                        }
                    }
                    if (standardLabels >= numLabels || emptyLabels >= numLabels) {
                        return;
                    }
                    const {
                        pdfViewer,
                        pdfThumbnailViewer,
                        toolbar
                    } = this;
                    pdfViewer.setPageLabels(labels);
                    pdfThumbnailViewer?.setPageLabels(labels);
                    toolbar?.setPagesCount(numLabels, true);
                    toolbar?.setPageNumber(pdfViewer.currentPageNumber, pdfViewer.currentPageLabel);
                },
                _initializePdfHistory({
                                          fingerprint,
                                          viewOnLoad,
                                          initialDest = null
                                      }) {
                    if (!this.pdfHistory) {
                        return;
                    }
                    this.pdfHistory.initialize({
                        fingerprint,
                        resetHistory: viewOnLoad === ViewOnLoad.INITIAL,
                        updateUrl: _app_options.AppOptions.get("historyUpdateUrl")
                    });
                    if (this.pdfHistory.initialBookmark) {
                        this.initialBookmark = this.pdfHistory.initialBookmark;
                        this.initialRotation = this.pdfHistory.initialRotation;
                    }
                    if (initialDest && !this.initialBookmark && viewOnLoad === ViewOnLoad.UNKNOWN) {
                        this.initialBookmark = JSON.stringify(initialDest);
                        this.pdfHistory.push({
                            explicitDest: initialDest,
                            pageNumber: null
                        });
                    }
                },
                _initializeAnnotationStorageCallbacks(pdfDocument) {
                    if (pdfDocument !== this.pdfDocument) {
                        return;
                    }
                    const {
                        annotationStorage
                    } = pdfDocument;
                    annotationStorage.onSetModified = () => {
                        window.addEventListener("beforeunload", beforeUnload);
                        this._annotationStorageModified = true;
                    };
                    annotationStorage.onResetModified = () => {
                        window.removeEventListener("beforeunload", beforeUnload);
                        delete this._annotationStorageModified;
                    };
                    annotationStorage.onAnnotationEditor = typeStr => {
                        this._hasAnnotationEditors = !!typeStr;
                        this.setTitle();
                        if (typeStr) {
                            this.externalServices.reportTelemetry({
                                type: "editing",
                                data: {
                                    type: typeStr
                                }
                            });
                        }
                    };
                },
                setInitialView(storedHash, {
                    rotation,
                    sidebarView,
                    scrollMode,
                    spreadMode
                } = {}) {
                    const setRotation = angle => {
                        if ((0, _ui_utils.isValidRotation)(angle)) {
                            this.pdfViewer.pagesRotation = angle;
                        }
                    };
                    const setViewerModes = (scroll, spread) => {
                        if ((0, _ui_utils.isValidScrollMode)(scroll)) {
                            this.pdfViewer.scrollMode = scroll;
                        }
                        if ((0, _ui_utils.isValidSpreadMode)(spread)) {
                            this.pdfViewer.spreadMode = spread;
                        }
                    };
                    this.isInitialViewSet = true;
                    this.pdfSidebar?.setInitialView(sidebarView);
                    setViewerModes(scrollMode, spreadMode);
                    if (this.initialBookmark) {
                        setRotation(this.initialRotation);
                        delete this.initialRotation;
                        this.pdfLinkService.setHash(this.initialBookmark);
                        this.initialBookmark = null;
                    } else if (storedHash) {
                        setRotation(rotation);
                        this.pdfLinkService.setHash(storedHash);
                    }
                    this.toolbar?.setPageNumber(this.pdfViewer.currentPageNumber, this.pdfViewer.currentPageLabel);
                    this.secondaryToolbar?.setPageNumber(this.pdfViewer.currentPageNumber);
                    if (!this.pdfViewer.currentScaleValue) {
                        this.pdfViewer.currentScaleValue = _ui_utils.DEFAULT_SCALE_VALUE;
                    }
                },
                _cleanup() {
                    if (!this.pdfDocument) {
                        return;
                    }
                    this.pdfViewer.cleanup();
                    this.pdfThumbnailViewer?.cleanup();
                    this.pdfDocument.cleanup();
                },
                forceRendering() {
                    this.pdfRenderingQueue.printing = !!this.printService;
                    this.pdfRenderingQueue.isThumbnailViewEnabled = this.pdfSidebar?.visibleView === _ui_utils.SidebarView.THUMBS;
                    this.pdfRenderingQueue.renderHighestPriority();
                },
                beforePrint() {
                    this._printAnnotationStoragePromise = this.pdfScriptingManager.dispatchWillPrint().catch(() => {
                    }).then(() => {
                        return this.pdfDocument?.annotationStorage.print;
                    });
                    if (this.printService) {
                        return;
                    }
                    if (!this.supportsPrinting) {
                        this.l10n.get("printing_not_supported").then(msg => {
                            this._otherError(msg);
                        });
                        return;
                    }
                    if (!this.pdfViewer.pageViewsReady) {
                        this.l10n.get("printing_not_ready").then(msg => {
                            window.alert(msg);
                        });
                        return;
                    }
                    const pagesOverview = this.pdfViewer.getPagesOverview();
                    const printContainer = this.appConfig.printContainer;
                    const printResolution = _app_options.AppOptions.get("printResolution");
                    const optionalContentConfigPromise = this.pdfViewer.optionalContentConfigPromise;
                    const printService = PDFPrintServiceFactory.instance.createPrintService(this.pdfDocument, pagesOverview, printContainer, printResolution, optionalContentConfigPromise, this._printAnnotationStoragePromise, this.l10n);
                    this.printService = printService;
                    this.forceRendering();
                    this.setTitle();
                    printService.layout();
                    if (this._hasAnnotationEditors) {
                        this.externalServices.reportTelemetry({
                            type: "editing",
                            data: {
                                type: "print"
                            }
                        });
                    }
                },
                afterPrint() {
                    if (this._printAnnotationStoragePromise) {
                        this._printAnnotationStoragePromise.then(() => {
                            this.pdfScriptingManager.dispatchDidPrint();
                        });
                        this._printAnnotationStoragePromise = null;
                    }
                    if (this.printService) {
                        this.printService.destroy();
                        this.printService = null;
                        this.pdfDocument?.annotationStorage.resetModified();
                    }
                    this.forceRendering();
                    this.setTitle();
                },
                rotatePages(delta) {
                    this.pdfViewer.pagesRotation += delta;
                },
                requestPresentationMode() {
                    this.pdfPresentationMode?.request();
                },
                triggerPrinting() {
                    if (!this.supportsPrinting) {
                        return;
                    }
                    window.print();
                },
                bindEvents() {
                    const {
                        eventBus,
                        _boundEvents
                    } = this;
                    _boundEvents.beforePrint = this.beforePrint.bind(this);
                    _boundEvents.afterPrint = this.afterPrint.bind(this);
                    eventBus._on("resize", webViewerResize);
                    eventBus._on("hashchange", webViewerHashchange);
                    eventBus._on("beforeprint", _boundEvents.beforePrint);
                    eventBus._on("afterprint", _boundEvents.afterPrint);
                    eventBus._on("pagerender", webViewerPageRender);
                    eventBus._on("pagerendered", webViewerPageRendered);
                    eventBus._on("updateviewarea", webViewerUpdateViewarea);
                    eventBus._on("pagechanging", webViewerPageChanging);
                    eventBus._on("scalechanging", webViewerScaleChanging);
                    eventBus._on("rotationchanging", webViewerRotationChanging);
                    eventBus._on("sidebarviewchanged", webViewerSidebarViewChanged);
                    eventBus._on("pagemode", webViewerPageMode);
                    eventBus._on("namedaction", webViewerNamedAction);
                    eventBus._on("presentationmodechanged", webViewerPresentationModeChanged);
                    eventBus._on("presentationmode", webViewerPresentationMode);
                    eventBus._on("switchannotationeditormode", webViewerSwitchAnnotationEditorMode);
                    eventBus._on("switchannotationeditorparams", webViewerSwitchAnnotationEditorParams);
                    eventBus._on("print", webViewerPrint);
                    eventBus._on("download", webViewerDownload);
                    eventBus._on("openinexternalapp", webViewerOpenInExternalApp);
                    eventBus._on("firstpage", webViewerFirstPage);
                    eventBus._on("lastpage", webViewerLastPage);
                    eventBus._on("nextpage", webViewerNextPage);
                    eventBus._on("previouspage", webViewerPreviousPage);
                    eventBus._on("zoomin", webViewerZoomIn);
                    eventBus._on("zoomout", webViewerZoomOut);
                    eventBus._on("zoomreset", webViewerZoomReset);
                    eventBus._on("pagenumberchanged", webViewerPageNumberChanged);
                    eventBus._on("scalechanged", webViewerScaleChanged);
                    eventBus._on("rotatecw", webViewerRotateCw);
                    eventBus._on("rotateccw", webViewerRotateCcw);
                    eventBus._on("optionalcontentconfig", webViewerOptionalContentConfig);
                    eventBus._on("switchscrollmode", webViewerSwitchScrollMode);
                    eventBus._on("scrollmodechanged", webViewerScrollModeChanged);
                    eventBus._on("switchspreadmode", webViewerSwitchSpreadMode);
                    eventBus._on("spreadmodechanged", webViewerSpreadModeChanged);
                    eventBus._on("documentproperties", webViewerDocumentProperties);
                    eventBus._on("findfromurlhash", webViewerFindFromUrlHash);
                    eventBus._on("updatefindmatchescount", webViewerUpdateFindMatchesCount);
                    eventBus._on("updatefindcontrolstate", webViewerUpdateFindControlState);
                    if (_app_options.AppOptions.get("pdfBug")) {
                        _boundEvents.reportPageStatsPDFBug = reportPageStatsPDFBug;
                        eventBus._on("pagerendered", _boundEvents.reportPageStatsPDFBug);
                        eventBus._on("pagechanging", _boundEvents.reportPageStatsPDFBug);
                    }
                    eventBus._on("fileinputchange", webViewerFileInputChange);
                    eventBus._on("openfile", webViewerOpenFile);
                },
                bindWindowEvents() {
                    const {
                        eventBus,
                        _boundEvents
                    } = this;

                    function addWindowResolutionChange(evt = null) {
                        if (evt) {
                            webViewerResolutionChange(evt);
                        }
                        const mediaQueryList = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
                        mediaQueryList.addEventListener("change", addWindowResolutionChange, {
                            once: true
                        });
                        _boundEvents.removeWindowResolutionChange ||= function () {
                            mediaQueryList.removeEventListener("change", addWindowResolutionChange);
                            _boundEvents.removeWindowResolutionChange = null;
                        };
                    }

                    addWindowResolutionChange();
                    _boundEvents.windowResize = () => {
                        eventBus.dispatch("resize", {
                            source: window
                        });
                    };
                    _boundEvents.windowHashChange = () => {
                        eventBus.dispatch("hashchange", {
                            source: window,
                            hash: document.location.hash.substring(1)
                        });
                    };
                    _boundEvents.windowBeforePrint = () => {
                        eventBus.dispatch("beforeprint", {
                            source: window
                        });
                    };
                    _boundEvents.windowAfterPrint = () => {
                        eventBus.dispatch("afterprint", {
                            source: window
                        });
                    };
                    _boundEvents.windowUpdateFromSandbox = event => {
                        eventBus.dispatch("updatefromsandbox", {
                            source: window,
                            detail: event.detail
                        });
                    };
                    window.addEventListener("visibilitychange", webViewerVisibilityChange);
                    window.addEventListener("wheel", webViewerWheel, {
                        passive: false
                    });
                    window.addEventListener("touchstart", webViewerTouchStart, {
                        passive: false
                    });
                    window.addEventListener("touchmove", webViewerTouchMove, {
                        passive: false
                    });
                    window.addEventListener("touchend", webViewerTouchEnd, {
                        passive: false
                    });
                    window.addEventListener("click", webViewerClick);
                    window.addEventListener("keydown", webViewerKeyDown);
                    window.addEventListener("keyup", webViewerKeyUp);
                    window.addEventListener("resize", _boundEvents.windowResize);
                    window.addEventListener("hashchange", _boundEvents.windowHashChange);
                    window.addEventListener("beforeprint", _boundEvents.windowBeforePrint);
                    window.addEventListener("afterprint", _boundEvents.windowAfterPrint);
                    window.addEventListener("updatefromsandbox", _boundEvents.windowUpdateFromSandbox);
                },
                unbindEvents() {
                    const {
                        eventBus,
                        _boundEvents
                    } = this;
                    eventBus._off("resize", webViewerResize);
                    eventBus._off("hashchange", webViewerHashchange);
                    eventBus._off("beforeprint", _boundEvents.beforePrint);
                    eventBus._off("afterprint", _boundEvents.afterPrint);
                    eventBus._off("pagerender", webViewerPageRender);
                    eventBus._off("pagerendered", webViewerPageRendered);
                    eventBus._off("updateviewarea", webViewerUpdateViewarea);
                    eventBus._off("pagechanging", webViewerPageChanging);
                    eventBus._off("scalechanging", webViewerScaleChanging);
                    eventBus._off("rotationchanging", webViewerRotationChanging);
                    eventBus._off("sidebarviewchanged", webViewerSidebarViewChanged);
                    eventBus._off("pagemode", webViewerPageMode);
                    eventBus._off("namedaction", webViewerNamedAction);
                    eventBus._off("presentationmodechanged", webViewerPresentationModeChanged);
                    eventBus._off("presentationmode", webViewerPresentationMode);
                    eventBus._off("print", webViewerPrint);
                    eventBus._off("download", webViewerDownload);
                    eventBus._off("openinexternalapp", webViewerOpenInExternalApp);
                    eventBus._off("firstpage", webViewerFirstPage);
                    eventBus._off("lastpage", webViewerLastPage);
                    eventBus._off("nextpage", webViewerNextPage);
                    eventBus._off("previouspage", webViewerPreviousPage);
                    eventBus._off("zoomin", webViewerZoomIn);
                    eventBus._off("zoomout", webViewerZoomOut);
                    eventBus._off("zoomreset", webViewerZoomReset);
                    eventBus._off("pagenumberchanged", webViewerPageNumberChanged);
                    eventBus._off("scalechanged", webViewerScaleChanged);
                    eventBus._off("rotatecw", webViewerRotateCw);
                    eventBus._off("rotateccw", webViewerRotateCcw);
                    eventBus._off("optionalcontentconfig", webViewerOptionalContentConfig);
                    eventBus._off("switchscrollmode", webViewerSwitchScrollMode);
                    eventBus._off("scrollmodechanged", webViewerScrollModeChanged);
                    eventBus._off("switchspreadmode", webViewerSwitchSpreadMode);
                    eventBus._off("spreadmodechanged", webViewerSpreadModeChanged);
                    eventBus._off("documentproperties", webViewerDocumentProperties);
                    eventBus._off("findfromurlhash", webViewerFindFromUrlHash);
                    eventBus._off("updatefindmatchescount", webViewerUpdateFindMatchesCount);
                    eventBus._off("updatefindcontrolstate", webViewerUpdateFindControlState);
                    if (_boundEvents.reportPageStatsPDFBug) {
                        eventBus._off("pagerendered", _boundEvents.reportPageStatsPDFBug);
                        eventBus._off("pagechanging", _boundEvents.reportPageStatsPDFBug);
                        _boundEvents.reportPageStatsPDFBug = null;
                    }
                    eventBus._off("fileinputchange", webViewerFileInputChange);
                    eventBus._off("openfile", webViewerOpenFile);
                    _boundEvents.beforePrint = null;
                    _boundEvents.afterPrint = null;
                },
                unbindWindowEvents() {
                    const {
                        _boundEvents
                    } = this;
                    window.removeEventListener("visibilitychange", webViewerVisibilityChange);
                    window.removeEventListener("wheel", webViewerWheel, {
                        passive: false
                    });
                    window.removeEventListener("touchstart", webViewerTouchStart, {
                        passive: false
                    });
                    window.removeEventListener("touchmove", webViewerTouchMove, {
                        passive: false
                    });
                    window.removeEventListener("touchend", webViewerTouchEnd, {
                        passive: false
                    });
                    window.removeEventListener("click", webViewerClick);
                    window.removeEventListener("keydown", webViewerKeyDown);
                    window.removeEventListener("keyup", webViewerKeyUp);
                    window.removeEventListener("resize", _boundEvents.windowResize);
                    window.removeEventListener("hashchange", _boundEvents.windowHashChange);
                    window.removeEventListener("beforeprint", _boundEvents.windowBeforePrint);
                    window.removeEventListener("afterprint", _boundEvents.windowAfterPrint);
                    window.removeEventListener("updatefromsandbox", _boundEvents.windowUpdateFromSandbox);
                    _boundEvents.removeWindowResolutionChange?.();
                    _boundEvents.windowResize = null;
                    _boundEvents.windowHashChange = null;
                    _boundEvents.windowBeforePrint = null;
                    _boundEvents.windowAfterPrint = null;
                    _boundEvents.windowUpdateFromSandbox = null;
                },
                _accumulateTicks(ticks, prop) {
                    if (this[prop] > 0 && ticks < 0 || this[prop] < 0 && ticks > 0) {
                        this[prop] = 0;
                    }
                    this[prop] += ticks;
                    const wholeTicks = Math.trunc(this[prop]);
                    this[prop] -= wholeTicks;
                    return wholeTicks;
                },
                _accumulateFactor(previousScale, factor, prop) {
                    if (factor === 1) {
                        return 1;
                    }
                    if (this[prop] > 1 && factor < 1 || this[prop] < 1 && factor > 1) {
                        this[prop] = 1;
                    }
                    const newFactor = Math.floor(previousScale * factor * this[prop] * 100) / (100 * previousScale);
                    this[prop] = factor / newFactor;
                    return newFactor;
                },
                _centerAtPos(previousScale, x, y) {
                    const {
                        pdfViewer
                    } = this;
                    const scaleDiff = pdfViewer.currentScale / previousScale - 1;
                    if (scaleDiff !== 0) {
                        const [top, left] = pdfViewer.containerTopLeft;
                        pdfViewer.container.scrollLeft += (x - left) * scaleDiff;
                        pdfViewer.container.scrollTop += (y - top) * scaleDiff;
                    }
                },
                _unblockDocumentLoadEvent() {
                    document.blockUnblockOnload?.(false);
                    this._unblockDocumentLoadEvent = () => {
                    };
                },
                get scriptingReady() {
                    return this.pdfScriptingManager.ready;
                }
            };
            exports.PDFViewerApplication = PDFViewerApplication;
            {
                const HOSTED_VIEWER_ORIGINS = ["null", "http://mozilla.github.io", "https://mozilla.github.io"];
                var validateFileURL = function (file) {
                    if (!file) {
                        return;
                    }
                    try {
                        const viewerOrigin = new URL(window.location.href).origin || "null";
                        if (HOSTED_VIEWER_ORIGINS.includes(viewerOrigin)) {
                            return;
                        }
                        const fileOrigin = new URL(file, window.location.href).origin;
                        if (fileOrigin !== viewerOrigin) {
                            throw new Error("file origin does not match viewer's");
                        }
                    } catch (ex) {
                        PDFViewerApplication.l10n.get("loading_error").then(msg => {
                            PDFViewerApplication._documentError(msg, {
                                message: ex?.message
                            });
                        });
                        throw ex;
                    }
                };
            }

            async function loadFakeWorker() {
                _pdfjsLib.GlobalWorkerOptions.workerSrc ||= _app_options.AppOptions.get("workerSrc");
                await (0, _pdfjsLib.loadScript)(_pdfjsLib.PDFWorker.workerSrc);
            }

            async function loadPDFBug(self) {
                const {
                    debuggerScriptPath
                } = self.appConfig;
                const {
                    PDFBug
                } = await import(debuggerScriptPath);
                self._PDFBug = PDFBug;
            }

            function reportPageStatsPDFBug({
                                               pageNumber
                                           }) {
                if (!globalThis.Stats?.enabled) {
                    return;
                }
                const pageView = PDFViewerApplication.pdfViewer.getPageView(pageNumber - 1);
                globalThis.Stats.add(pageNumber, pageView?.pdfPage?.stats);
            }

            function webViewerPageRender({
                                             pageNumber
                                         }) {
                if (pageNumber === PDFViewerApplication.page) {
                    PDFViewerApplication.toolbar?.updateLoadingIndicatorState(true);
                }
            }

            function webViewerPageRendered({
                                               pageNumber,
                                               error
                                           }) {
                if (pageNumber === PDFViewerApplication.page) {
                    PDFViewerApplication.toolbar?.updateLoadingIndicatorState(false);
                }
                if (PDFViewerApplication.pdfSidebar?.visibleView === _ui_utils.SidebarView.THUMBS) {
                    const pageView = PDFViewerApplication.pdfViewer.getPageView(pageNumber - 1);
                    const thumbnailView = PDFViewerApplication.pdfThumbnailViewer?.getThumbnail(pageNumber - 1);
                    if (pageView) {
                        thumbnailView?.setImage(pageView);
                    }
                }
                if (error) {
                    PDFViewerApplication.l10n.get("rendering_error").then(msg => {
                        PDFViewerApplication._otherError(msg, error);
                    });
                }
            }

            function webViewerPageMode({
                                           mode
                                       }) {
                let view;
                switch (mode) {
                    case "thumbs":
                        view = _ui_utils.SidebarView.THUMBS;
                        break;
                    case "bookmarks":
                    case "outline":
                        view = _ui_utils.SidebarView.OUTLINE;
                        break;
                    case "attachments":
                        view = _ui_utils.SidebarView.ATTACHMENTS;
                        break;
                    case "layers":
                        view = _ui_utils.SidebarView.LAYERS;
                        break;
                    case "none":
                        view = _ui_utils.SidebarView.NONE;
                        break;
                    default:
                        console.error('Invalid "pagemode" hash parameter: ' + mode);
                        return;
                }
                PDFViewerApplication.pdfSidebar?.switchView(view, true);
            }

            function webViewerNamedAction(evt) {
                switch (evt.action) {
                    case "GoToPage":
                        PDFViewerApplication.appConfig.toolbar?.pageNumber.select();
                        break;
                    case "Find":
                        if (!PDFViewerApplication.supportsIntegratedFind) {
                            PDFViewerApplication?.findBar.toggle();
                        }
                        break;
                    case "Print":
                        PDFViewerApplication.triggerPrinting();
                        break;
                    case "SaveAs":
                        PDFViewerApplication.downloadOrSave();
                        break;
                }
            }

            function webViewerPresentationModeChanged(evt) {
                PDFViewerApplication.pdfViewer.presentationModeState = evt.state;
            }

            function webViewerSidebarViewChanged({
                                                     view
                                                 }) {
                PDFViewerApplication.pdfRenderingQueue.isThumbnailViewEnabled = view === _ui_utils.SidebarView.THUMBS;
                if (PDFViewerApplication.isInitialViewSet) {
                    PDFViewerApplication.store?.set("sidebarView", view).catch(() => {
                    });
                }
            }

            function webViewerUpdateViewarea({
                                                 location
                                             }) {
                if (PDFViewerApplication.isInitialViewSet) {
                    PDFViewerApplication.store?.setMultiple({
                        page: location.pageNumber,
                        zoom: location.scale,
                        scrollLeft: location.left,
                        scrollTop: location.top,
                        rotation: location.rotation
                    }).catch(() => {
                    });
                }
                if (PDFViewerApplication.appConfig.secondaryToolbar) {
                    const href = PDFViewerApplication.pdfLinkService.getAnchorUrl(location.pdfOpenParams);
                    PDFViewerApplication.appConfig.secondaryToolbar.viewBookmarkButton.href = href;
                }
            }

            function webViewerScrollModeChanged(evt) {
                if (PDFViewerApplication.isInitialViewSet && !PDFViewerApplication.pdfViewer.isInPresentationMode) {
                    PDFViewerApplication.store?.set("scrollMode", evt.mode).catch(() => {
                    });
                }
            }

            function webViewerSpreadModeChanged(evt) {
                if (PDFViewerApplication.isInitialViewSet && !PDFViewerApplication.pdfViewer.isInPresentationMode) {
                    PDFViewerApplication.store?.set("spreadMode", evt.mode).catch(() => {
                    });
                }
            }

            function webViewerResize() {
                const {
                    pdfDocument,
                    pdfViewer,
                    pdfRenderingQueue
                } = PDFViewerApplication;
                if (pdfRenderingQueue.printing && window.matchMedia("print").matches) {
                    return;
                }
                if (!pdfDocument) {
                    return;
                }
                const currentScaleValue = pdfViewer.currentScaleValue;
                if (currentScaleValue === "auto" || currentScaleValue === "page-fit" || currentScaleValue === "page-width") {
                    pdfViewer.currentScaleValue = currentScaleValue;
                }
                pdfViewer.update();
            }

            function webViewerHashchange(evt) {
                const hash = evt.hash;
                if (!hash) {
                    return;
                }
                if (!PDFViewerApplication.isInitialViewSet) {
                    PDFViewerApplication.initialBookmark = hash;
                } else if (!PDFViewerApplication.pdfHistory?.popStateInProgress) {
                    PDFViewerApplication.pdfLinkService.setHash(hash);
                }
            }

            {
                var webViewerFileInputChange = function (evt) {
                    if (PDFViewerApplication.pdfViewer?.isInPresentationMode) {
                        return;
                    }
                    const file = evt.fileInput.files[0];
                    PDFViewerApplication.open({
                        url: URL.createObjectURL(file),
                        originalUrl: file.name
                    });
                };
                var webViewerOpenFile = function (evt) {
                    const fileInput = PDFViewerApplication.appConfig.openFileInput;
                    fileInput.click();
                };
            }

            function webViewerPresentationMode() {
                PDFViewerApplication.requestPresentationMode();
            }

            function webViewerSwitchAnnotationEditorMode(evt) {
                PDFViewerApplication.pdfViewer.annotationEditorMode = evt;
            }

            function webViewerSwitchAnnotationEditorParams(evt) {
                PDFViewerApplication.pdfViewer.annotationEditorParams = evt;
            }

            function webViewerPrint() {
                PDFViewerApplication.triggerPrinting();
            }

            function webViewerDownload() {
                PDFViewerApplication.downloadOrSave();
            }

            function webViewerOpenInExternalApp() {
                PDFViewerApplication.openInExternalApp();
            }

            function webViewerFirstPage() {
                PDFViewerApplication.page = 1;
            }

            function webViewerLastPage() {
                PDFViewerApplication.page = PDFViewerApplication.pagesCount;
            }

            function webViewerNextPage() {
                PDFViewerApplication.pdfViewer.nextPage();
            }

            function webViewerPreviousPage() {
                PDFViewerApplication.pdfViewer.previousPage();
            }

            function webViewerZoomIn() {
                PDFViewerApplication.zoomIn();
            }

            function webViewerZoomOut() {
                PDFViewerApplication.zoomOut();
            }

            function webViewerZoomReset() {
                PDFViewerApplication.zoomReset();
            }

            function webViewerPageNumberChanged(evt) {
                const pdfViewer = PDFViewerApplication.pdfViewer;
                if (evt.value !== "") {
                    PDFViewerApplication.pdfLinkService.goToPage(evt.value);
                }
                if (evt.value !== pdfViewer.currentPageNumber.toString() && evt.value !== pdfViewer.currentPageLabel) {
                    PDFViewerApplication.toolbar?.setPageNumber(pdfViewer.currentPageNumber, pdfViewer.currentPageLabel);
                }
            }

            function webViewerScaleChanged(evt) {
                PDFViewerApplication.pdfViewer.currentScaleValue = evt.value;
            }

            function webViewerRotateCw() {
                PDFViewerApplication.rotatePages(90);
            }

            function webViewerRotateCcw() {
                PDFViewerApplication.rotatePages(-90);
            }

            function webViewerOptionalContentConfig(evt) {
                PDFViewerApplication.pdfViewer.optionalContentConfigPromise = evt.promise;
            }

            function webViewerSwitchScrollMode(evt) {
                PDFViewerApplication.pdfViewer.scrollMode = evt.mode;
            }

            function webViewerSwitchSpreadMode(evt) {
                PDFViewerApplication.pdfViewer.spreadMode = evt.mode;
            }

            function webViewerDocumentProperties() {
                PDFViewerApplication.pdfDocumentProperties?.open();
            }

            function webViewerFindFromUrlHash(evt) {
                PDFViewerApplication.eventBus.dispatch("find", {
                    source: evt.source,
                    type: "",
                    query: evt.query,
                    caseSensitive: false,
                    entireWord: false,
                    highlightAll: true,
                    findPrevious: false,
                    matchDiacritics: true
                });
            }

            function webViewerUpdateFindMatchesCount({
                                                         matchesCount
                                                     }) {
                if (PDFViewerApplication.supportsIntegratedFind) {
                    PDFViewerApplication.externalServices.updateFindMatchesCount(matchesCount);
                } else {
                    PDFViewerApplication.findBar.updateResultsCount(matchesCount);
                }
            }

            function webViewerUpdateFindControlState({
                                                         state,
                                                         previous,
                                                         matchesCount,
                                                         rawQuery
                                                     }) {
                if (PDFViewerApplication.supportsIntegratedFind) {
                    PDFViewerApplication.externalServices.updateFindControlState({
                        result: state,
                        findPrevious: previous,
                        matchesCount,
                        rawQuery
                    });
                } else {
                    PDFViewerApplication.findBar?.updateUIState(state, previous, matchesCount);
                }
            }

            function webViewerScaleChanging(evt) {
                PDFViewerApplication.toolbar?.setPageScale(evt.presetValue, evt.scale);
                PDFViewerApplication.pdfViewer.update();
            }

            function webViewerRotationChanging(evt) {
                if (PDFViewerApplication.pdfThumbnailViewer) {
                    PDFViewerApplication.pdfThumbnailViewer.pagesRotation = evt.pagesRotation;
                }
                PDFViewerApplication.forceRendering();
                PDFViewerApplication.pdfViewer.currentPageNumber = evt.pageNumber;
            }

            function webViewerPageChanging({
                                               pageNumber,
                                               pageLabel
                                           }) {
                PDFViewerApplication.toolbar?.setPageNumber(pageNumber, pageLabel);
                PDFViewerApplication.secondaryToolbar?.setPageNumber(pageNumber);
                if (PDFViewerApplication.pdfSidebar?.visibleView === _ui_utils.SidebarView.THUMBS) {
                    PDFViewerApplication.pdfThumbnailViewer?.scrollThumbnailIntoView(pageNumber);
                }
                const currentPage = PDFViewerApplication.pdfViewer.getPageView(pageNumber - 1);
                PDFViewerApplication.toolbar?.updateLoadingIndicatorState(currentPage?.renderingState === _ui_utils.RenderingStates.RUNNING);
            }

            function webViewerResolutionChange(evt) {
                PDFViewerApplication.pdfViewer.refresh();
            }

            function webViewerVisibilityChange(evt) {
                if (document.visibilityState === "visible") {
                    setZoomDisabledTimeout();
                }
            }

            let zoomDisabledTimeout = null;

            function setZoomDisabledTimeout() {
                if (zoomDisabledTimeout) {
                    clearTimeout(zoomDisabledTimeout);
                }
                zoomDisabledTimeout = setTimeout(function () {
                    zoomDisabledTimeout = null;
                }, WHEEL_ZOOM_DISABLED_TIMEOUT);
            }

            function webViewerWheel(evt) {
                const {
                    pdfViewer,
                    supportedMouseWheelZoomModifierKeys,
                    supportsPinchToZoom
                } = PDFViewerApplication;
                if (pdfViewer.isInPresentationMode) {
                    return;
                }
                const deltaMode = evt.deltaMode;
                let scaleFactor = Math.exp(-evt.deltaY / 100);
                const isBuiltInMac = false;
                const isPinchToZoom = evt.ctrlKey && !PDFViewerApplication._isCtrlKeyDown && deltaMode === WheelEvent.DOM_DELTA_PIXEL && evt.deltaX === 0 && (Math.abs(scaleFactor - 1) < 0.05 || isBuiltInMac) && evt.deltaZ === 0;
                if (isPinchToZoom || evt.ctrlKey && supportedMouseWheelZoomModifierKeys.ctrlKey || evt.metaKey && supportedMouseWheelZoomModifierKeys.metaKey) {
                    evt.preventDefault();
                    if (zoomDisabledTimeout || document.visibilityState === "hidden" || PDFViewerApplication.overlayManager.active) {
                        return;
                    }
                    const previousScale = pdfViewer.currentScale;
                    if (isPinchToZoom && supportsPinchToZoom) {
                        scaleFactor = PDFViewerApplication._accumulateFactor(previousScale, scaleFactor, "_wheelUnusedFactor");
                        if (scaleFactor < 1) {
                            PDFViewerApplication.zoomOut(null, scaleFactor);
                        } else if (scaleFactor > 1) {
                            PDFViewerApplication.zoomIn(null, scaleFactor);
                        } else {
                            return;
                        }
                    } else {
                        const delta = (0, _ui_utils.normalizeWheelEventDirection)(evt);
                        let ticks = 0;
                        if (deltaMode === WheelEvent.DOM_DELTA_LINE || deltaMode === WheelEvent.DOM_DELTA_PAGE) {
                            if (Math.abs(delta) >= 1) {
                                ticks = Math.sign(delta);
                            } else {
                                ticks = PDFViewerApplication._accumulateTicks(delta, "_wheelUnusedTicks");
                            }
                        } else {
                            const PIXELS_PER_LINE_SCALE = 30;
                            ticks = PDFViewerApplication._accumulateTicks(delta / PIXELS_PER_LINE_SCALE, "_wheelUnusedTicks");
                        }
                        if (ticks < 0) {
                            PDFViewerApplication.zoomOut(-ticks);
                        } else if (ticks > 0) {
                            PDFViewerApplication.zoomIn(ticks);
                        } else {
                            return;
                        }
                    }
                    PDFViewerApplication._centerAtPos(previousScale, evt.clientX, evt.clientY);
                } else {
                    setZoomDisabledTimeout();
                }
            }

            function webViewerTouchStart(evt) {
                if (PDFViewerApplication.pdfViewer.isInPresentationMode || evt.touches.length < 2) {
                    return;
                }
                evt.preventDefault();
                if (evt.touches.length !== 2 || PDFViewerApplication.overlayManager.active) {
                    PDFViewerApplication._touchInfo = null;
                    return;
                }
                let [touch0, touch1] = evt.touches;
                if (touch0.identifier > touch1.identifier) {
                    [touch0, touch1] = [touch1, touch0];
                }
                PDFViewerApplication._touchInfo = {
                    touch0X: touch0.pageX,
                    touch0Y: touch0.pageY,
                    touch1X: touch1.pageX,
                    touch1Y: touch1.pageY
                };
            }

            function webViewerTouchMove(evt) {
                if (!PDFViewerApplication._touchInfo || evt.touches.length !== 2) {
                    return;
                }
                const {
                    pdfViewer,
                    _touchInfo,
                    supportsPinchToZoom
                } = PDFViewerApplication;
                let [touch0, touch1] = evt.touches;
                if (touch0.identifier > touch1.identifier) {
                    [touch0, touch1] = [touch1, touch0];
                }
                const {
                    pageX: page0X,
                    pageY: page0Y
                } = touch0;
                const {
                    pageX: page1X,
                    pageY: page1Y
                } = touch1;
                const {
                    touch0X: pTouch0X,
                    touch0Y: pTouch0Y,
                    touch1X: pTouch1X,
                    touch1Y: pTouch1Y
                } = _touchInfo;
                if (Math.abs(pTouch0X - page0X) <= 1 && Math.abs(pTouch0Y - page0Y) <= 1 && Math.abs(pTouch1X - page1X) <= 1 && Math.abs(pTouch1Y - page1Y) <= 1) {
                    return;
                }
                _touchInfo.touch0X = page0X;
                _touchInfo.touch0Y = page0Y;
                _touchInfo.touch1X = page1X;
                _touchInfo.touch1Y = page1Y;
                if (pTouch0X === page0X && pTouch0Y === page0Y) {
                    const v1X = pTouch1X - page0X;
                    const v1Y = pTouch1Y - page0Y;
                    const v2X = page1X - page0X;
                    const v2Y = page1Y - page0Y;
                    const det = v1X * v2Y - v1Y * v2X;
                    if (Math.abs(det) > 0.02 * Math.hypot(v1X, v1Y) * Math.hypot(v2X, v2Y)) {
                        return;
                    }
                } else if (pTouch1X === page1X && pTouch1Y === page1Y) {
                    const v1X = pTouch0X - page1X;
                    const v1Y = pTouch0Y - page1Y;
                    const v2X = page0X - page1X;
                    const v2Y = page0Y - page1Y;
                    const det = v1X * v2Y - v1Y * v2X;
                    if (Math.abs(det) > 0.02 * Math.hypot(v1X, v1Y) * Math.hypot(v2X, v2Y)) {
                        return;
                    }
                } else {
                    const diff0X = page0X - pTouch0X;
                    const diff1X = page1X - pTouch1X;
                    const diff0Y = page0Y - pTouch0Y;
                    const diff1Y = page1Y - pTouch1Y;
                    const dotProduct = diff0X * diff1X + diff0Y * diff1Y;
                    if (dotProduct >= 0) {
                        return;
                    }
                }
                evt.preventDefault();
                const distance = Math.hypot(page0X - page1X, page0Y - page1Y) || 1;
                const pDistance = Math.hypot(pTouch0X - pTouch1X, pTouch0Y - pTouch1Y) || 1;
                const previousScale = pdfViewer.currentScale;
                if (supportsPinchToZoom) {
                    const newScaleFactor = PDFViewerApplication._accumulateFactor(previousScale, distance / pDistance, "_touchUnusedFactor");
                    if (newScaleFactor < 1) {
                        PDFViewerApplication.zoomOut(null, newScaleFactor);
                    } else if (newScaleFactor > 1) {
                        PDFViewerApplication.zoomIn(null, newScaleFactor);
                    } else {
                        return;
                    }
                } else {
                    const PIXELS_PER_LINE_SCALE = 30;
                    const ticks = PDFViewerApplication._accumulateTicks((distance - pDistance) / PIXELS_PER_LINE_SCALE, "_touchUnusedTicks");
                    if (ticks < 0) {
                        PDFViewerApplication.zoomOut(-ticks);
                    } else if (ticks > 0) {
                        PDFViewerApplication.zoomIn(ticks);
                    } else {
                        return;
                    }
                }
                PDFViewerApplication._centerAtPos(previousScale, (page0X + page1X) / 2, (page0Y + page1Y) / 2);
            }

            function webViewerTouchEnd(evt) {
                if (!PDFViewerApplication._touchInfo) {
                    return;
                }
                evt.preventDefault();
                PDFViewerApplication._touchInfo = null;
                PDFViewerApplication._touchUnusedTicks = 0;
                PDFViewerApplication._touchUnusedFactor = 1;
            }

            function webViewerClick(evt) {
                if (!PDFViewerApplication.secondaryToolbar?.isOpen) {
                    return;
                }
                const appConfig = PDFViewerApplication.appConfig;
                if (PDFViewerApplication.pdfViewer.containsElement(evt.target) || appConfig.toolbar?.container.contains(evt.target) && evt.target !== appConfig.secondaryToolbar?.toggleButton) {
                    PDFViewerApplication.secondaryToolbar.close();
                }
            }

            function webViewerKeyUp(evt) {
                if (evt.key === "Control") {
                    PDFViewerApplication._isCtrlKeyDown = false;
                }
            }

            function webViewerKeyDown(evt) {
                PDFViewerApplication._isCtrlKeyDown = evt.key === "Control";
                if (PDFViewerApplication.overlayManager.active) {
                    return;
                }
                const {
                    eventBus,
                    pdfViewer
                } = PDFViewerApplication;
                const isViewerInPresentationMode = pdfViewer.isInPresentationMode;
                let handled = false,
                    ensureViewerFocused = false;
                const cmd = (evt.ctrlKey ? 1 : 0) | (evt.altKey ? 2 : 0) | (evt.shiftKey ? 4 : 0) | (evt.metaKey ? 8 : 0);
                if (cmd === 1 || cmd === 8 || cmd === 5 || cmd === 12) {
                    switch (evt.keyCode) {
                        case 70:
                            if (!PDFViewerApplication.supportsIntegratedFind && !evt.shiftKey) {
                                PDFViewerApplication.findBar?.open();
                                handled = true;
                            }
                            break;
                        case 71:
                            if (!PDFViewerApplication.supportsIntegratedFind) {
                                const {
                                    state
                                } = PDFViewerApplication.findController;
                                if (state) {
                                    const newState = {
                                        source: window,
                                        type: "again",
                                        findPrevious: cmd === 5 || cmd === 12
                                    };
                                    eventBus.dispatch("find", {
                                        ...state,
                                        ...newState
                                    });
                                }
                                handled = true;
                            }
                            break;
                        case 61:
                        case 107:
                        case 187:
                        case 171:
                            PDFViewerApplication.zoomIn();
                            handled = true;
                            break;
                        case 173:
                        case 109:
                        case 189:
                            PDFViewerApplication.zoomOut();
                            handled = true;
                            break;
                        case 48:
                        case 96:
                            if (!isViewerInPresentationMode) {
                                setTimeout(function () {
                                    PDFViewerApplication.zoomReset();
                                });
                                handled = false;
                            }
                            break;
                        case 38:
                            if (isViewerInPresentationMode || PDFViewerApplication.page > 1) {
                                PDFViewerApplication.page = 1;
                                handled = true;
                                ensureViewerFocused = true;
                            }
                            break;
                        case 40:
                            if (isViewerInPresentationMode || PDFViewerApplication.page < PDFViewerApplication.pagesCount) {
                                PDFViewerApplication.page = PDFViewerApplication.pagesCount;
                                handled = true;
                                ensureViewerFocused = true;
                            }
                            break;
                    }
                }
                if (cmd === 1 || cmd === 8) {
                    switch (evt.keyCode) {
                        case 83:
                            eventBus.dispatch("download", {
                                source: window
                            });
                            handled = true;
                            break;
                        case 79: {
                            eventBus.dispatch("openfile", {
                                source: window
                            });
                            handled = true;
                        }
                            break;
                    }
                }
                if (cmd === 3 || cmd === 10) {
                    switch (evt.keyCode) {
                        case 80:
                            PDFViewerApplication.requestPresentationMode();
                            handled = true;
                            PDFViewerApplication.externalServices.reportTelemetry({
                                type: "buttons",
                                data: {
                                    id: "presentationModeKeyboard"
                                }
                            });
                            break;
                        case 71:
                            if (PDFViewerApplication.appConfig.toolbar) {
                                PDFViewerApplication.appConfig.toolbar.pageNumber.select();
                                handled = true;
                            }
                            break;
                    }
                }
                if (handled) {
                    if (ensureViewerFocused && !isViewerInPresentationMode) {
                        pdfViewer.focus();
                    }
                    evt.preventDefault();
                    return;
                }
                const curElement = (0, _ui_utils.getActiveOrFocusedElement)();
                const curElementTagName = curElement?.tagName.toUpperCase();
                if (curElementTagName === "INPUT" || curElementTagName === "TEXTAREA" || curElementTagName === "SELECT" || curElement?.isContentEditable) {
                    if (evt.keyCode !== 27) {
                        return;
                    }
                }
                if (cmd === 0) {
                    let turnPage = 0,
                        turnOnlyIfPageFit = false;
                    switch (evt.keyCode) {
                        case 38:
                        case 33:
                            if (pdfViewer.isVerticalScrollbarEnabled) {
                                turnOnlyIfPageFit = true;
                            }
                            turnPage = -1;
                            break;
                        case 8:
                            if (!isViewerInPresentationMode) {
                                turnOnlyIfPageFit = true;
                            }
                            turnPage = -1;
                            break;
                        case 37:
                            if (pdfViewer.isHorizontalScrollbarEnabled) {
                                turnOnlyIfPageFit = true;
                            }
                        case 75:
                        case 80:
                            turnPage = -1;
                            break;
                        case 27:
                            if (PDFViewerApplication.secondaryToolbar?.isOpen) {
                                PDFViewerApplication.secondaryToolbar.close();
                                handled = true;
                            }
                            if (!PDFViewerApplication.supportsIntegratedFind && PDFViewerApplication.findBar?.opened) {
                                PDFViewerApplication.findBar.close();
                                handled = true;
                            }
                            break;
                        case 40:
                        case 34:
                            if (pdfViewer.isVerticalScrollbarEnabled) {
                                turnOnlyIfPageFit = true;
                            }
                            turnPage = 1;
                            break;
                        case 13:
                        case 32:
                            if (!isViewerInPresentationMode) {
                                turnOnlyIfPageFit = true;
                            }
                            turnPage = 1;
                            break;
                        case 39:
                            if (pdfViewer.isHorizontalScrollbarEnabled) {
                                turnOnlyIfPageFit = true;
                            }
                        case 74:
                        case 78:
                            turnPage = 1;
                            break;
                        case 36:
                            if (isViewerInPresentationMode || PDFViewerApplication.page > 1) {
                                PDFViewerApplication.page = 1;
                                handled = true;
                                ensureViewerFocused = true;
                            }
                            break;
                        case 35:
                            if (isViewerInPresentationMode || PDFViewerApplication.page < PDFViewerApplication.pagesCount) {
                                PDFViewerApplication.page = PDFViewerApplication.pagesCount;
                                handled = true;
                                ensureViewerFocused = true;
                            }
                            break;
                        case 83:
                            PDFViewerApplication.pdfCursorTools?.switchTool(_ui_utils.CursorTool.SELECT);
                            break;
                        case 72:
                            PDFViewerApplication.pdfCursorTools?.switchTool(_ui_utils.CursorTool.HAND);
                            break;
                        case 82:
                            PDFViewerApplication.rotatePages(90);
                            break;
                        case 115:
                            PDFViewerApplication.pdfSidebar?.toggle();
                            break;
                    }
                    if (turnPage !== 0 && (!turnOnlyIfPageFit || pdfViewer.currentScaleValue === "page-fit")) {
                        if (turnPage > 0) {
                            pdfViewer.nextPage();
                        } else {
                            pdfViewer.previousPage();
                        }
                        handled = true;
                    }
                }
                if (cmd === 4) {
                    switch (evt.keyCode) {
                        case 13:
                        case 32:
                            if (!isViewerInPresentationMode && pdfViewer.currentScaleValue !== "page-fit") {
                                break;
                            }
                            pdfViewer.previousPage();
                            handled = true;
                            break;
                        case 82:
                            PDFViewerApplication.rotatePages(-90);
                            break;
                    }
                }
                if (!handled && !isViewerInPresentationMode) {
                    if (evt.keyCode >= 33 && evt.keyCode <= 40 || evt.keyCode === 32 && curElementTagName !== "BUTTON") {
                        ensureViewerFocused = true;
                    }
                }
                if (ensureViewerFocused && !pdfViewer.containsElement(curElement)) {
                    pdfViewer.focus();
                }
                if (handled) {
                    evt.preventDefault();
                }
            }

            function beforeUnload(evt) {
                evt.preventDefault();
                evt.returnValue = "";
                return false;
            }

            function webViewerAnnotationEditorStatesChanged(data) {
                PDFViewerApplication.externalServices.updateEditorStates(data);
            }

            function webViewerReportTelemetry({
                                                  details
                                              }) {
                PDFViewerApplication.externalServices.reportTelemetry(details);
            }

            const PDFPrintServiceFactory = {
                instance: {
                    supportsPrinting: false,
                    createPrintService() {
                        throw new Error("Not implemented: createPrintService");
                    }
                }
            };
            exports.PDFPrintServiceFactory = PDFPrintServiceFactory;

            /***/
        }),
        /* 3 */
        /***/ ((__unused_webpack_module, exports) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.animationStarted = exports.VERTICAL_PADDING = exports.UNKNOWN_SCALE = exports.TextLayerMode = exports.SpreadMode = exports.SidebarView = exports.ScrollMode = exports.SCROLLBAR_PADDING = exports.RenderingStates = exports.ProgressBar = exports.PresentationModeState = exports.OutputScale = exports.MIN_SCALE = exports.MAX_SCALE = exports.MAX_AUTO_SCALE = exports.DEFAULT_SCALE_VALUE = exports.DEFAULT_SCALE_DELTA = exports.DEFAULT_SCALE = exports.CursorTool = exports.AutoPrintRegExp = void 0;
            exports.apiPageLayoutToViewerModes = apiPageLayoutToViewerModes;
            exports.apiPageModeToSidebarView = apiPageModeToSidebarView;
            exports.approximateFraction = approximateFraction;
            exports.backtrackBeforeAllVisibleElements = backtrackBeforeAllVisibleElements;
            exports.binarySearchFirstItem = binarySearchFirstItem;
            exports.docStyle = void 0;
            exports.getActiveOrFocusedElement = getActiveOrFocusedElement;
            exports.getPageSizeInches = getPageSizeInches;
            exports.getVisibleElements = getVisibleElements;
            exports.isPortraitOrientation = isPortraitOrientation;
            exports.isValidRotation = isValidRotation;
            exports.isValidScrollMode = isValidScrollMode;
            exports.isValidSpreadMode = isValidSpreadMode;
            exports.normalizeWheelEventDelta = normalizeWheelEventDelta;
            exports.normalizeWheelEventDirection = normalizeWheelEventDirection;
            exports.parseQueryString = parseQueryString;
            exports.removeNullCharacters = removeNullCharacters;
            exports.roundToDivide = roundToDivide;
            exports.scrollIntoView = scrollIntoView;
            exports.toggleCheckedBtn = toggleCheckedBtn;
            exports.toggleExpandedBtn = toggleExpandedBtn;
            exports.watchScroll = watchScroll;
            const DEFAULT_SCALE_VALUE = "auto";
            exports.DEFAULT_SCALE_VALUE = DEFAULT_SCALE_VALUE;
            const DEFAULT_SCALE = 1.0;
            exports.DEFAULT_SCALE = DEFAULT_SCALE;
            const DEFAULT_SCALE_DELTA = 1.1;
            exports.DEFAULT_SCALE_DELTA = DEFAULT_SCALE_DELTA;
            const MIN_SCALE = 0.1;
            exports.MIN_SCALE = MIN_SCALE;
            const MAX_SCALE = 10.0;
            exports.MAX_SCALE = MAX_SCALE;
            const UNKNOWN_SCALE = 0;
            exports.UNKNOWN_SCALE = UNKNOWN_SCALE;
            const MAX_AUTO_SCALE = 1.25;
            exports.MAX_AUTO_SCALE = MAX_AUTO_SCALE;
            const SCROLLBAR_PADDING = 40;
            exports.SCROLLBAR_PADDING = SCROLLBAR_PADDING;
            const VERTICAL_PADDING = 5;
            exports.VERTICAL_PADDING = VERTICAL_PADDING;
            const RenderingStates = {
                INITIAL: 0,
                RUNNING: 1,
                PAUSED: 2,
                FINISHED: 3
            };
            exports.RenderingStates = RenderingStates;
            const PresentationModeState = {
                UNKNOWN: 0,
                NORMAL: 1,
                CHANGING: 2,
                FULLSCREEN: 3
            };
            exports.PresentationModeState = PresentationModeState;
            const SidebarView = {
                UNKNOWN: -1,
                NONE: 0,
                THUMBS: 1,
                OUTLINE: 2,
                ATTACHMENTS: 3,
                LAYERS: 4
            };
            exports.SidebarView = SidebarView;
            const TextLayerMode = {
                DISABLE: 0,
                ENABLE: 1,
                ENABLE_PERMISSIONS: 2
            };
            exports.TextLayerMode = TextLayerMode;
            const ScrollMode = {
                UNKNOWN: -1,
                VERTICAL: 0,
                HORIZONTAL: 1,
                WRAPPED: 2,
                PAGE: 3
            };
            exports.ScrollMode = ScrollMode;
            const SpreadMode = {
                UNKNOWN: -1,
                NONE: 0,
                ODD: 1,
                EVEN: 2
            };
            exports.SpreadMode = SpreadMode;
            const CursorTool = {
                SELECT: 0,
                HAND: 1,
                ZOOM: 2
            };
            exports.CursorTool = CursorTool;
            const AutoPrintRegExp = /\bprint\s*\(/;
            exports.AutoPrintRegExp = AutoPrintRegExp;

            class OutputScale {
                constructor() {
                    const pixelRatio = window.devicePixelRatio || 1;
                    this.sx = pixelRatio;
                    this.sy = pixelRatio;
                }

                get scaled() {
                    return this.sx !== 1 || this.sy !== 1;
                }
            }

            exports.OutputScale = OutputScale;

            function scrollIntoView(element, spot, scrollMatches = false) {
                let parent = element.offsetParent;
                if (!parent) {
                    console.error("offsetParent is not set -- cannot scroll");
                    return;
                }
                let offsetY = element.offsetTop + element.clientTop;
                let offsetX = element.offsetLeft + element.clientLeft;
                while (parent.clientHeight === parent.scrollHeight && parent.clientWidth === parent.scrollWidth || scrollMatches && (parent.classList.contains("markedContent") || getComputedStyle(parent).overflow === "hidden")) {
                    offsetY += parent.offsetTop;
                    offsetX += parent.offsetLeft;
                    parent = parent.offsetParent;
                    if (!parent) {
                        return;
                    }
                }
                if (spot) {
                    if (spot.top !== undefined) {
                        offsetY += spot.top;
                    }
                    if (spot.left !== undefined) {
                        offsetX += spot.left;
                        parent.scrollLeft = offsetX;
                    }
                }
                parent.scrollTop = offsetY;
            }

            function watchScroll(viewAreaElement, callback) {
                const debounceScroll = function (evt) {
                    if (rAF) {
                        return;
                    }
                    rAF = window.requestAnimationFrame(function viewAreaElementScrolled() {
                        rAF = null;
                        const currentX = viewAreaElement.scrollLeft;
                        const lastX = state.lastX;
                        if (currentX !== lastX) {
                            state.right = currentX > lastX;
                        }
                        state.lastX = currentX;
                        const currentY = viewAreaElement.scrollTop;
                        const lastY = state.lastY;
                        if (currentY !== lastY) {
                            state.down = currentY > lastY;
                        }
                        state.lastY = currentY;
                        callback(state);
                    });
                };
                const state = {
                    right: true,
                    down: true,
                    lastX: viewAreaElement.scrollLeft,
                    lastY: viewAreaElement.scrollTop,
                    _eventHandler: debounceScroll
                };
                let rAF = null;
                viewAreaElement.addEventListener("scroll", debounceScroll, true);
                return state;
            }

            function parseQueryString(query) {
                const params = new Map();
                for (const [key, value] of new URLSearchParams(query)) {
                    params.set(key.toLowerCase(), value);
                }
                return params;
            }

            const InvisibleCharactersRegExp = /[\x01-\x1F]/g;

            function removeNullCharacters(str, replaceInvisible = false) {
                if (typeof str !== "string") {
                    console.error(`The argument must be a string.`);
                    return str;
                }
                if (replaceInvisible) {
                    str = str.replaceAll(InvisibleCharactersRegExp, " ");
                }
                return str.replaceAll("\x00", "");
            }

            function binarySearchFirstItem(items, condition, start = 0) {
                let minIndex = start;
                let maxIndex = items.length - 1;
                if (maxIndex < 0 || !condition(items[maxIndex])) {
                    return items.length;
                }
                if (condition(items[minIndex])) {
                    return minIndex;
                }
                while (minIndex < maxIndex) {
                    const currentIndex = minIndex + maxIndex >> 1;
                    const currentItem = items[currentIndex];
                    if (condition(currentItem)) {
                        maxIndex = currentIndex;
                    } else {
                        minIndex = currentIndex + 1;
                    }
                }
                return minIndex;
            }

            function approximateFraction(x) {
                if (Math.floor(x) === x) {
                    return [x, 1];
                }
                const xinv = 1 / x;
                const limit = 8;
                if (xinv > limit) {
                    return [1, limit];
                } else if (Math.floor(xinv) === xinv) {
                    return [1, xinv];
                }
                const x_ = x > 1 ? xinv : x;
                let a = 0,
                    b = 1,
                    c = 1,
                    d = 1;
                while (true) {
                    const p = a + c,
                        q = b + d;
                    if (q > limit) {
                        break;
                    }
                    if (x_ <= p / q) {
                        c = p;
                        d = q;
                    } else {
                        a = p;
                        b = q;
                    }
                }
                let result;
                if (x_ - a / b < c / d - x_) {
                    result = x_ === x ? [a, b] : [b, a];
                } else {
                    result = x_ === x ? [c, d] : [d, c];
                }
                return result;
            }

            function roundToDivide(x, div) {
                const r = x % div;
                return r === 0 ? x : Math.round(x - r + div);
            }

            function getPageSizeInches({
                                           view,
                                           userUnit,
                                           rotate
                                       }) {
                const [x1, y1, x2, y2] = view;
                const changeOrientation = rotate % 180 !== 0;
                const width = (x2 - x1) / 72 * userUnit;
                const height = (y2 - y1) / 72 * userUnit;
                return {
                    width: changeOrientation ? height : width,
                    height: changeOrientation ? width : height
                };
            }

            function backtrackBeforeAllVisibleElements(index, views, top) {
                if (index < 2) {
                    return index;
                }
                let elt = views[index].div;
                let pageTop = elt.offsetTop + elt.clientTop;
                if (pageTop >= top) {
                    elt = views[index - 1].div;
                    pageTop = elt.offsetTop + elt.clientTop;
                }
                for (let i = index - 2; i >= 0; --i) {
                    elt = views[i].div;
                    if (elt.offsetTop + elt.clientTop + elt.clientHeight <= pageTop) {
                        break;
                    }
                    index = i;
                }
                return index;
            }

            function getVisibleElements({
                                            scrollEl,
                                            views,
                                            sortByVisibility = false,
                                            horizontal = false,
                                            rtl = false
                                        }) {
                const top = scrollEl.scrollTop,
                    bottom = top + scrollEl.clientHeight;
                const left = scrollEl.scrollLeft,
                    right = left + scrollEl.clientWidth;

                function isElementBottomAfterViewTop(view) {
                    const element = view.div;
                    const elementBottom = element.offsetTop + element.clientTop + element.clientHeight;
                    return elementBottom > top;
                }

                function isElementNextAfterViewHorizontally(view) {
                    const element = view.div;
                    const elementLeft = element.offsetLeft + element.clientLeft;
                    const elementRight = elementLeft + element.clientWidth;
                    return rtl ? elementLeft < right : elementRight > left;
                }

                const visible = [],
                    ids = new Set(),
                    numViews = views.length;
                let firstVisibleElementInd = binarySearchFirstItem(views, horizontal ? isElementNextAfterViewHorizontally : isElementBottomAfterViewTop);
                if (firstVisibleElementInd > 0 && firstVisibleElementInd < numViews && !horizontal) {
                    firstVisibleElementInd = backtrackBeforeAllVisibleElements(firstVisibleElementInd, views, top);
                }
                let lastEdge = horizontal ? right : -1;
                for (let i = firstVisibleElementInd; i < numViews; i++) {
                    const view = views[i],
                        element = view.div;
                    const currentWidth = element.offsetLeft + element.clientLeft;
                    const currentHeight = element.offsetTop + element.clientTop;
                    const viewWidth = element.clientWidth,
                        viewHeight = element.clientHeight;
                    const viewRight = currentWidth + viewWidth;
                    const viewBottom = currentHeight + viewHeight;
                    if (lastEdge === -1) {
                        if (viewBottom >= bottom) {
                            lastEdge = viewBottom;
                        }
                    } else if ((horizontal ? currentWidth : currentHeight) > lastEdge) {
                        break;
                    }
                    if (viewBottom <= top || currentHeight >= bottom || viewRight <= left || currentWidth >= right) {
                        continue;
                    }
                    const hiddenHeight = Math.max(0, top - currentHeight) + Math.max(0, viewBottom - bottom);
                    const hiddenWidth = Math.max(0, left - currentWidth) + Math.max(0, viewRight - right);
                    const fractionHeight = (viewHeight - hiddenHeight) / viewHeight,
                        fractionWidth = (viewWidth - hiddenWidth) / viewWidth;
                    const percent = fractionHeight * fractionWidth * 100 | 0;
                    visible.push({
                        id: view.id,
                        x: currentWidth,
                        y: currentHeight,
                        view,
                        percent,
                        widthPercent: fractionWidth * 100 | 0
                    });
                    ids.add(view.id);
                }
                const first = visible[0],
                    last = visible.at(-1);
                if (sortByVisibility) {
                    visible.sort(function (a, b) {
                        const pc = a.percent - b.percent;
                        if (Math.abs(pc) > 0.001) {
                            return -pc;
                        }
                        return a.id - b.id;
                    });
                }
                return {
                    first,
                    last,
                    views: visible,
                    ids
                };
            }

            function normalizeWheelEventDirection(evt) {
                let delta = Math.hypot(evt.deltaX, evt.deltaY);
                const angle = Math.atan2(evt.deltaY, evt.deltaX);
                if (-0.25 * Math.PI < angle && angle < 0.75 * Math.PI) {
                    delta = -delta;
                }
                return delta;
            }

            function normalizeWheelEventDelta(evt) {
                const deltaMode = evt.deltaMode;
                let delta = normalizeWheelEventDirection(evt);
                const MOUSE_PIXELS_PER_LINE = 30;
                const MOUSE_LINES_PER_PAGE = 30;
                if (deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
                    delta /= MOUSE_PIXELS_PER_LINE * MOUSE_LINES_PER_PAGE;
                } else if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
                    delta /= MOUSE_LINES_PER_PAGE;
                }
                return delta;
            }

            function isValidRotation(angle) {
                return Number.isInteger(angle) && angle % 90 === 0;
            }

            function isValidScrollMode(mode) {
                return Number.isInteger(mode) && Object.values(ScrollMode).includes(mode) && mode !== ScrollMode.UNKNOWN;
            }

            function isValidSpreadMode(mode) {
                return Number.isInteger(mode) && Object.values(SpreadMode).includes(mode) && mode !== SpreadMode.UNKNOWN;
            }

            function isPortraitOrientation(size) {
                return size.width <= size.height;
            }

            const animationStarted = new Promise(function (resolve) {
                window.requestAnimationFrame(resolve);
            });
            exports.animationStarted = animationStarted;
            const docStyle = document.documentElement.style;
            exports.docStyle = docStyle;

            function clamp(v, min, max) {
                return Math.min(Math.max(v, min), max);
            }

            class ProgressBar {
                #classList = null;
                #disableAutoFetchTimeout = null;
                #percent = 0;
                #style = null;
                #visible = true;

                constructor(bar) {
                    this.#classList = bar.classList;
                    this.#style = bar.style;
                }

                get percent() {
                    return this.#percent;
                }

                set percent(val) {
                    this.#percent = clamp(val, 0, 100);
                    if (isNaN(val)) {
                        this.#classList.add("indeterminate");
                        return;
                    }
                    this.#classList.remove("indeterminate");
                    this.#style.setProperty("--progressBar-percent", `${this.#percent}%`);
                }

                setWidth(viewer) {
                    if (!viewer) {
                        return;
                    }
                    const container = viewer.parentNode;
                    const scrollbarWidth = container.offsetWidth - viewer.offsetWidth;
                    if (scrollbarWidth > 0) {
                        this.#style.setProperty("--progressBar-end-offset", `${scrollbarWidth}px`);
                    }
                }

                setDisableAutoFetch(delay = 5000) {
                    if (isNaN(this.#percent)) {
                        return;
                    }
                    if (this.#disableAutoFetchTimeout) {
                        clearTimeout(this.#disableAutoFetchTimeout);
                    }
                    this.show();
                    this.#disableAutoFetchTimeout = setTimeout(() => {
                        this.#disableAutoFetchTimeout = null;
                        this.hide();
                    }, delay);
                }

                hide() {
                    if (!this.#visible) {
                        return;
                    }
                    this.#visible = false;
                    this.#classList.add("hidden");
                }

                show() {
                    if (this.#visible) {
                        return;
                    }
                    this.#visible = true;
                    this.#classList.remove("hidden");
                }
            }

            exports.ProgressBar = ProgressBar;

            function getActiveOrFocusedElement() {
                let curRoot = document;
                let curActiveOrFocused = curRoot.activeElement || curRoot.querySelector(":focus");
                while (curActiveOrFocused?.shadowRoot) {
                    curRoot = curActiveOrFocused.shadowRoot;
                    curActiveOrFocused = curRoot.activeElement || curRoot.querySelector(":focus");
                }
                return curActiveOrFocused;
            }

            function apiPageLayoutToViewerModes(layout) {
                let scrollMode = ScrollMode.VERTICAL,
                    spreadMode = SpreadMode.NONE;
                switch (layout) {
                    case "SinglePage":
                        scrollMode = ScrollMode.PAGE;
                        break;
                    case "OneColumn":
                        break;
                    case "TwoPageLeft":
                        scrollMode = ScrollMode.PAGE;
                    case "TwoColumnLeft":
                        spreadMode = SpreadMode.ODD;
                        break;
                    case "TwoPageRight":
                        scrollMode = ScrollMode.PAGE;
                    case "TwoColumnRight":
                        spreadMode = SpreadMode.EVEN;
                        break;
                }
                return {
                    scrollMode,
                    spreadMode
                };
            }

            function apiPageModeToSidebarView(mode) {
                switch (mode) {
                    case "UseNone":
                        return SidebarView.NONE;
                    case "UseThumbs":
                        return SidebarView.THUMBS;
                    case "UseOutlines":
                        return SidebarView.OUTLINE;
                    case "UseAttachments":
                        return SidebarView.ATTACHMENTS;
                    case "UseOC":
                        return SidebarView.LAYERS;
                }
                return SidebarView.NONE;
            }

            function toggleCheckedBtn(button, toggle, view = null) {
                button.classList.toggle("toggled", toggle);
                button.setAttribute("aria-checked", toggle);
                view?.classList.toggle("hidden", !toggle);
            }

            function toggleExpandedBtn(button, toggle, view = null) {
                button.classList.toggle("toggled", toggle);
                button.setAttribute("aria-expanded", toggle);
                view?.classList.toggle("hidden", !toggle);
            }

            /***/
        }),
        /* 4 */
        /***/ ((module) => {


            module.exports = globalThis.pdfjsLib;

            /***/
        }),
        /* 5 */
        /***/ ((__unused_webpack_module, exports) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.compatibilityParams = exports.OptionKind = exports.AppOptions = void 0;
            const compatibilityParams = Object.create(null);
            exports.compatibilityParams = compatibilityParams;
            {
                const userAgent = navigator.userAgent || "";
                const platform = navigator.platform || "";
                const maxTouchPoints = navigator.maxTouchPoints || 1;
                const isAndroid = /Android/.test(userAgent);
                const isIOS = /\b(iPad|iPhone|iPod)(?=;)/.test(userAgent) || platform === "MacIntel" && maxTouchPoints > 1;
                (function checkCanvasSizeLimitation() {
                    if (isIOS || isAndroid) {
                        compatibilityParams.maxCanvasPixels = 5242880;
                    }
                })();
            }
            const OptionKind = {
                VIEWER: 0x02,
                API: 0x04,
                WORKER: 0x08,
                PREFERENCE: 0x80
            };
            exports.OptionKind = OptionKind;
            const defaultOptions = {
                annotationEditorMode: {
                    value: 0,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                annotationMode: {
                    value: 2,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                cursorToolOnLoad: {
                    value: 0,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                defaultZoomDelay: {
                    value: 400,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                defaultZoomValue: {
                    value: "",
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                disableHistory: {
                    value: false,
                    kind: OptionKind.VIEWER
                },
                disablePageLabels: {
                    value: false,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                enablePermissions: {
                    value: false,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                enablePrintAutoRotate: {
                    value: true,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                enableScripting: {
                    value: true,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                enableStampEditor: {
                    value: true,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                externalLinkRel: {
                    value: "noopener noreferrer nofollow",
                    kind: OptionKind.VIEWER
                },
                externalLinkTarget: {
                    value: 0,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                historyUpdateUrl: {
                    value: false,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                ignoreDestinationZoom: {
                    value: false,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                imageResourcesPath: {
                    value: "./images/",
                    kind: OptionKind.VIEWER
                },
                maxCanvasPixels: {
                    value: 16777216,
                    kind: OptionKind.VIEWER
                },
                forcePageColors: {
                    value: false,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                pageColorsBackground: {
                    value: "Canvas",
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                pageColorsForeground: {
                    value: "CanvasText",
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                pdfBugEnabled: {
                    value: false,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                printResolution: {
                    value: 150,
                    kind: OptionKind.VIEWER
                },
                sidebarViewOnLoad: {
                    value: -1,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                scrollModeOnLoad: {
                    value: -1,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                spreadModeOnLoad: {
                    value: -1,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                textLayerMode: {
                    value: 1,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                viewerCssTheme: {
                    value: 0,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                viewOnLoad: {
                    value: 0,
                    kind: OptionKind.VIEWER + OptionKind.PREFERENCE
                },
                cMapPacked: {
                    value: true,
                    kind: OptionKind.API
                },
                cMapUrl: {
                    value: "../web/cmaps/",
                    kind: OptionKind.API
                },
                disableAutoFetch: {
                    value: false,
                    kind: OptionKind.API + OptionKind.PREFERENCE
                },
                disableFontFace: {
                    value: false,
                    kind: OptionKind.API + OptionKind.PREFERENCE
                },
                disableRange: {
                    value: false,
                    kind: OptionKind.API + OptionKind.PREFERENCE
                },
                disableStream: {
                    value: false,
                    kind: OptionKind.API + OptionKind.PREFERENCE
                },
                docBaseUrl: {
                    value: "",
                    kind: OptionKind.API
                },
                enableXfa: {
                    value: true,
                    kind: OptionKind.API + OptionKind.PREFERENCE
                },
                fontExtraProperties: {
                    value: false,
                    kind: OptionKind.API
                },
                isEvalSupported: {
                    value: true,
                    kind: OptionKind.API
                },
                isOffscreenCanvasSupported: {
                    value: true,
                    kind: OptionKind.API
                },
                maxImageSize: {
                    value: -1,
                    kind: OptionKind.API
                },
                pdfBug: {
                    value: false,
                    kind: OptionKind.API
                },
                standardFontDataUrl: {
                    value: "../web/standard_fonts/",
                    kind: OptionKind.API
                },
                verbosity: {
                    value: 1,
                    kind: OptionKind.API
                },
                workerPort: {
                    value: null,
                    kind: OptionKind.WORKER
                },
                workerSrc: {
                    value: "./pdfjs/pdf.worker.js",
                    kind: OptionKind.WORKER
                }
            };
            {
                defaultOptions.defaultUrl = {
                    value: "./pdfjs/example/Welcome.pdf",
                    kind: OptionKind.VIEWER
                };
                defaultOptions.disablePreferences = {
                    value: false,
                    kind: OptionKind.VIEWER
                };
                defaultOptions.locale = {
                    value: navigator.language || "en-US",
                    kind: OptionKind.VIEWER
                };
                defaultOptions.sandboxBundleSrc = {
                    value: "../build/pdf.sandbox.js",
                    kind: OptionKind.VIEWER
                };
            }
            const userOptions = Object.create(null);

            class AppOptions {
                constructor() {
                    throw new Error("Cannot initialize AppOptions.");
                }

                static get(name) {
                    const userOption = userOptions[name];
                    if (userOption !== undefined) {
                        return userOption;
                    }
                    const defaultOption = defaultOptions[name];
                    if (defaultOption !== undefined) {
                        return compatibilityParams[name] ?? defaultOption.value;
                    }
                    return undefined;
                }

                static getAll(kind = null) {
                    const options = Object.create(null);
                    for (const name in defaultOptions) {
                        const defaultOption = defaultOptions[name];
                        if (kind) {
                            if ((kind & defaultOption.kind) === 0) {
                                continue;
                            }
                            if (kind === OptionKind.PREFERENCE) {
                                const value = defaultOption.value,
                                    valueType = typeof value;
                                if (valueType === "boolean" || valueType === "string" || valueType === "number" && Number.isInteger(value)) {
                                    options[name] = value;
                                    continue;
                                }
                                throw new Error(`Invalid type for preference: ${name}`);
                            }
                        }
                        const userOption = userOptions[name];
                        options[name] = userOption !== undefined ? userOption : compatibilityParams[name] ?? defaultOption.value;
                    }
                    return options;
                }

                static set(name, value) {
                    userOptions[name] = value;
                }

                static setAll(options) {
                    for (const name in options) {
                        userOptions[name] = options[name];
                    }
                }

                static remove(name) {
                    delete userOptions[name];
                }
            }

            exports.AppOptions = AppOptions;
            {
                AppOptions._hasUserOptions = function () {
                    return Object.keys(userOptions).length > 0;
                };
            }

            /***/
        }),
        /* 6 */
        /***/ ((__unused_webpack_module, exports) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.WaitOnType = exports.EventBus = exports.AutomationEventBus = void 0;
            exports.waitOnEventOrTimeout = waitOnEventOrTimeout;
            const WaitOnType = {
                EVENT: "event",
                TIMEOUT: "timeout"
            };
            exports.WaitOnType = WaitOnType;

            function waitOnEventOrTimeout({
                                              target,
                                              name,
                                              delay = 0
                                          }) {
                return new Promise(function (resolve, reject) {
                    if (typeof target !== "object" || !(name && typeof name === "string") || !(Number.isInteger(delay) && delay >= 0)) {
                        throw new Error("waitOnEventOrTimeout - invalid parameters.");
                    }

                    function handler(type) {
                        if (target instanceof EventBus) {
                            target._off(name, eventHandler);
                        } else {
                            target.removeEventListener(name, eventHandler);
                        }
                        if (timeout) {
                            clearTimeout(timeout);
                        }
                        resolve(type);
                    }

                    const eventHandler = handler.bind(null, WaitOnType.EVENT);
                    if (target instanceof EventBus) {
                        target._on(name, eventHandler);
                    } else {
                        target.addEventListener(name, eventHandler);
                    }
                    const timeoutHandler = handler.bind(null, WaitOnType.TIMEOUT);
                    const timeout = setTimeout(timeoutHandler, delay);
                });
            }

            class EventBus {
                #listeners = Object.create(null);

                on(eventName, listener, options = null) {
                    this._on(eventName, listener, {
                        external: true,
                        once: options?.once
                    });
                }

                off(eventName, listener, options = null) {
                    this._off(eventName, listener, {
                        external: true,
                        once: options?.once
                    });
                }

                dispatch(eventName, data) {
                    const eventListeners = this.#listeners[eventName];
                    if (!eventListeners || eventListeners.length === 0) {
                        return;
                    }
                    let externalListeners;
                    for (const {
                        listener,
                        external,
                        once
                    } of eventListeners.slice(0)) {
                        if (once) {
                            this._off(eventName, listener);
                        }
                        if (external) {
                            (externalListeners ||= []).push(listener);
                            continue;
                        }
                        listener(data);
                    }
                    if (externalListeners) {
                        for (const listener of externalListeners) {
                            listener(data);
                        }
                        externalListeners = null;
                    }
                }

                _on(eventName, listener, options = null) {
                    const eventListeners = this.#listeners[eventName] ||= [];
                    eventListeners.push({
                        listener,
                        external: options?.external === true,
                        once: options?.once === true
                    });
                }

                _off(eventName, listener, options = null) {
                    const eventListeners = this.#listeners[eventName];
                    if (!eventListeners) {
                        return;
                    }
                    for (let i = 0, ii = eventListeners.length; i < ii; i++) {
                        if (eventListeners[i].listener === listener) {
                            eventListeners.splice(i, 1);
                            return;
                        }
                    }
                }
            }

            exports.EventBus = EventBus;

            class AutomationEventBus extends EventBus {
                dispatch(eventName, data) {
                    throw new Error("Not implemented: AutomationEventBus.dispatch");
                }
            }

            exports.AutomationEventBus = AutomationEventBus;

            /***/
        }),
        /* 7 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.SimpleLinkService = exports.PDFLinkService = exports.LinkTarget = void 0;
            var _ui_utils = __webpack_require__(3);
            const DEFAULT_LINK_REL = "noopener noreferrer nofollow";
            const LinkTarget = {
                NONE: 0,
                SELF: 1,
                BLANK: 2,
                PARENT: 3,
                TOP: 4
            };
            exports.LinkTarget = LinkTarget;

            function addLinkAttributes(link, {
                url,
                target,
                rel,
                enabled = true
            } = {}) {
                if (!url || typeof url !== "string") {
                    throw new Error('A valid "url" parameter must provided.');
                }
                if (enabled) {
                    link.href = link.title = url;
                } else {
                    link.href = "";
                    link.title = `Disabled: ${url}`;
                    link.onclick = () => {
                        return false;
                    };
                }
                let targetStr = "";
                switch (target) {
                    case LinkTarget.NONE:
                        break;
                    case LinkTarget.SELF:
                        targetStr = "_self";
                        break;
                    case LinkTarget.BLANK:
                        targetStr = "_blank";
                        break;
                    case LinkTarget.PARENT:
                        targetStr = "_parent";
                        break;
                    case LinkTarget.TOP:
                        targetStr = "_top";
                        break;
                }
                link.target = targetStr;
                link.rel = typeof rel === "string" ? rel : DEFAULT_LINK_REL;
            }

            class PDFLinkService {
                #pagesRefCache = new Map();

                constructor({
                                eventBus,
                                externalLinkTarget = null,
                                externalLinkRel = null,
                                ignoreDestinationZoom = false
                            } = {}) {
                    this.eventBus = eventBus;
                    this.externalLinkTarget = externalLinkTarget;
                    this.externalLinkRel = externalLinkRel;
                    this.externalLinkEnabled = true;
                    this._ignoreDestinationZoom = ignoreDestinationZoom;
                    this.baseUrl = null;
                    this.pdfDocument = null;
                    this.pdfViewer = null;
                    this.pdfHistory = null;
                }

                setDocument(pdfDocument, baseUrl = null) {
                    this.baseUrl = baseUrl;
                    this.pdfDocument = pdfDocument;
                    this.#pagesRefCache.clear();
                }

                setViewer(pdfViewer) {
                    this.pdfViewer = pdfViewer;
                }

                setHistory(pdfHistory) {
                    this.pdfHistory = pdfHistory;
                }

                get pagesCount() {
                    return this.pdfDocument ? this.pdfDocument.numPages : 0;
                }

                get page() {
                    return this.pdfViewer.currentPageNumber;
                }

                set page(value) {
                    this.pdfViewer.currentPageNumber = value;
                }

                get rotation() {
                    return this.pdfViewer.pagesRotation;
                }

                set rotation(value) {
                    this.pdfViewer.pagesRotation = value;
                }

                get isInPresentationMode() {
                    return this.pdfViewer.isInPresentationMode;
                }

                #goToDestinationHelper(rawDest, namedDest = null, explicitDest) {
                    const destRef = explicitDest[0];
                    let pageNumber;
                    if (typeof destRef === "object" && destRef !== null) {
                        pageNumber = this._cachedPageNumber(destRef);
                        if (!pageNumber) {
                            this.pdfDocument.getPageIndex(destRef).then(pageIndex => {
                                this.cachePageRef(pageIndex + 1, destRef);
                                this.#goToDestinationHelper(rawDest, namedDest, explicitDest);
                            }).catch(() => {
                                console.error(`PDFLinkService.#goToDestinationHelper: "${destRef}" is not ` + `a valid page reference, for dest="${rawDest}".`);
                            });
                            return;
                        }
                    } else if (Number.isInteger(destRef)) {
                        pageNumber = destRef + 1;
                    } else {
                        console.error(`PDFLinkService.#goToDestinationHelper: "${destRef}" is not ` + `a valid destination reference, for dest="${rawDest}".`);
                        return;
                    }
                    if (!pageNumber || pageNumber < 1 || pageNumber > this.pagesCount) {
                        console.error(`PDFLinkService.#goToDestinationHelper: "${pageNumber}" is not ` + `a valid page number, for dest="${rawDest}".`);
                        return;
                    }
                    if (this.pdfHistory) {
                        this.pdfHistory.pushCurrentPosition();
                        this.pdfHistory.push({
                            namedDest,
                            explicitDest,
                            pageNumber
                        });
                    }
                    this.pdfViewer.scrollPageIntoView({
                        pageNumber,
                        destArray: explicitDest,
                        ignoreDestinationZoom: this._ignoreDestinationZoom
                    });
                }

                async goToDestination(dest) {
                    if (!this.pdfDocument) {
                        return;
                    }
                    let namedDest, explicitDest;
                    if (typeof dest === "string") {
                        namedDest = dest;
                        explicitDest = await this.pdfDocument.getDestination(dest);
                    } else {
                        namedDest = null;
                        explicitDest = await dest;
                    }
                    if (!Array.isArray(explicitDest)) {
                        console.error(`PDFLinkService.goToDestination: "${explicitDest}" is not ` + `a valid destination array, for dest="${dest}".`);
                        return;
                    }
                    this.#goToDestinationHelper(dest, namedDest, explicitDest);
                }

                goToPage(val) {
                    if (!this.pdfDocument) {
                        return;
                    }
                    const pageNumber = typeof val === "string" && this.pdfViewer.pageLabelToPageNumber(val) || val | 0;
                    if (!(Number.isInteger(pageNumber) && pageNumber > 0 && pageNumber <= this.pagesCount)) {
                        console.error(`PDFLinkService.goToPage: "${val}" is not a valid page.`);
                        return;
                    }
                    if (this.pdfHistory) {
                        this.pdfHistory.pushCurrentPosition();
                        this.pdfHistory.pushPage(pageNumber);
                    }
                    this.pdfViewer.scrollPageIntoView({
                        pageNumber
                    });
                }

                addLinkAttributes(link, url, newWindow = false) {
                    addLinkAttributes(link, {
                        url,
                        target: newWindow ? LinkTarget.BLANK : this.externalLinkTarget,
                        rel: this.externalLinkRel,
                        enabled: this.externalLinkEnabled
                    });
                }

                getDestinationHash(dest) {
                    if (typeof dest === "string") {
                        if (dest.length > 0) {
                            return this.getAnchorUrl("#" + escape(dest));
                        }
                    } else if (Array.isArray(dest)) {
                        const str = JSON.stringify(dest);
                        if (str.length > 0) {
                            return this.getAnchorUrl("#" + escape(str));
                        }
                    }
                    return this.getAnchorUrl("");
                }

                getAnchorUrl(anchor) {
                    return this.baseUrl ? this.baseUrl + anchor : anchor;
                }

                setHash(hash) {
                    if (!this.pdfDocument) {
                        return;
                    }
                    let pageNumber, dest;
                    if (hash.includes("=")) {
                        const params = (0, _ui_utils.parseQueryString)(hash);
                        if (params.has("search")) {
                            const query = params.get("search").replaceAll('"', ""),
                                phrase = params.get("phrase") === "true";
                            this.eventBus.dispatch("findfromurlhash", {
                                source: this,
                                query: phrase ? query : query.match(/\S+/g)
                            });
                        }
                        if (params.has("page")) {
                            pageNumber = params.get("page") | 0 || 1;
                        }
                        if (params.has("zoom")) {
                            const zoomArgs = params.get("zoom").split(",");
                            const zoomArg = zoomArgs[0];
                            const zoomArgNumber = parseFloat(zoomArg);
                            if (!zoomArg.includes("Fit")) {
                                dest = [null, {
                                    name: "XYZ"
                                }, zoomArgs.length > 1 ? zoomArgs[1] | 0 : null, zoomArgs.length > 2 ? zoomArgs[2] | 0 : null, zoomArgNumber ? zoomArgNumber / 100 : zoomArg];
                            } else if (zoomArg === "Fit" || zoomArg === "FitB") {
                                dest = [null, {
                                    name: zoomArg
                                }];
                            } else if (zoomArg === "FitH" || zoomArg === "FitBH" || zoomArg === "FitV" || zoomArg === "FitBV") {
                                dest = [null, {
                                    name: zoomArg
                                }, zoomArgs.length > 1 ? zoomArgs[1] | 0 : null];
                            } else if (zoomArg === "FitR") {
                                if (zoomArgs.length !== 5) {
                                    console.error('PDFLinkService.setHash: Not enough parameters for "FitR".');
                                } else {
                                    dest = [null, {
                                        name: zoomArg
                                    }, zoomArgs[1] | 0, zoomArgs[2] | 0, zoomArgs[3] | 0, zoomArgs[4] | 0];
                                }
                            } else {
                                console.error(`PDFLinkService.setHash: "${zoomArg}" is not a valid zoom value.`);
                            }
                        }
                        if (dest) {
                            this.pdfViewer.scrollPageIntoView({
                                pageNumber: pageNumber || this.page,
                                destArray: dest,
                                allowNegativeOffset: true
                            });
                        } else if (pageNumber) {
                            this.page = pageNumber;
                        }
                        if (params.has("pagemode")) {
                            this.eventBus.dispatch("pagemode", {
                                source: this,
                                mode: params.get("pagemode")
                            });
                        }
                        if (params.has("nameddest")) {
                            this.goToDestination(params.get("nameddest"));
                        }
                    } else {
                        dest = unescape(hash);
                        try {
                            dest = JSON.parse(dest);
                            if (!Array.isArray(dest)) {
                                dest = dest.toString();
                            }
                        } catch {
                        }
                        if (typeof dest === "string" || PDFLinkService.#isValidExplicitDestination(dest)) {
                            this.goToDestination(dest);
                            return;
                        }
                        console.error(`PDFLinkService.setHash: "${unescape(hash)}" is not a valid destination.`);
                    }
                }

                executeNamedAction(action) {
                    switch (action) {
                        case "GoBack":
                            this.pdfHistory?.back();
                            break;
                        case "GoForward":
                            this.pdfHistory?.forward();
                            break;
                        case "NextPage":
                            this.pdfViewer.nextPage();
                            break;
                        case "PrevPage":
                            this.pdfViewer.previousPage();
                            break;
                        case "LastPage":
                            this.page = this.pagesCount;
                            break;
                        case "FirstPage":
                            this.page = 1;
                            break;
                        default:
                            break;
                    }
                    this.eventBus.dispatch("namedaction", {
                        source: this,
                        action
                    });
                }

                async executeSetOCGState(action) {
                    const pdfDocument = this.pdfDocument;
                    const optionalContentConfig = await this.pdfViewer.optionalContentConfigPromise;
                    if (pdfDocument !== this.pdfDocument) {
                        return;
                    }
                    let operator;
                    for (const elem of action.state) {
                        switch (elem) {
                            case "ON":
                            case "OFF":
                            case "Toggle":
                                operator = elem;
                                continue;
                        }
                        switch (operator) {
                            case "ON":
                                optionalContentConfig.setVisibility(elem, true);
                                break;
                            case "OFF":
                                optionalContentConfig.setVisibility(elem, false);
                                break;
                            case "Toggle":
                                const group = optionalContentConfig.getGroup(elem);
                                if (group) {
                                    optionalContentConfig.setVisibility(elem, !group.visible);
                                }
                                break;
                        }
                    }
                    this.pdfViewer.optionalContentConfigPromise = Promise.resolve(optionalContentConfig);
                }

                cachePageRef(pageNum, pageRef) {
                    if (!pageRef) {
                        return;
                    }
                    const refStr = pageRef.gen === 0 ? `${pageRef.num}R` : `${pageRef.num}R${pageRef.gen}`;
                    this.#pagesRefCache.set(refStr, pageNum);
                }

                _cachedPageNumber(pageRef) {
                    if (!pageRef) {
                        return null;
                    }
                    const refStr = pageRef.gen === 0 ? `${pageRef.num}R` : `${pageRef.num}R${pageRef.gen}`;
                    return this.#pagesRefCache.get(refStr) || null;
                }

                static #isValidExplicitDestination(dest) {
                    if (!Array.isArray(dest)) {
                        return false;
                    }
                    const destLength = dest.length;
                    if (destLength < 2) {
                        return false;
                    }
                    const page = dest[0];
                    if (!(typeof page === "object" && Number.isInteger(page.num) && Number.isInteger(page.gen)) && !(Number.isInteger(page) && page >= 0)) {
                        return false;
                    }
                    const zoom = dest[1];
                    if (!(typeof zoom === "object" && typeof zoom.name === "string")) {
                        return false;
                    }
                    let allowNull = true;
                    switch (zoom.name) {
                        case "XYZ":
                            if (destLength !== 5) {
                                return false;
                            }
                            break;
                        case "Fit":
                        case "FitB":
                            return destLength === 2;
                        case "FitH":
                        case "FitBH":
                        case "FitV":
                        case "FitBV":
                            if (destLength !== 3) {
                                return false;
                            }
                            break;
                        case "FitR":
                            if (destLength !== 6) {
                                return false;
                            }
                            allowNull = false;
                            break;
                        default:
                            return false;
                    }
                    for (let i = 2; i < destLength; i++) {
                        const param = dest[i];
                        if (!(typeof param === "number" || allowNull && param === null)) {
                            return false;
                        }
                    }
                    return true;
                }
            }

            exports.PDFLinkService = PDFLinkService;

            class SimpleLinkService {
                constructor() {
                    this.externalLinkEnabled = true;
                }

                get pagesCount() {
                    return 0;
                }

                get page() {
                    return 0;
                }

                set page(value) {
                }

                get rotation() {
                    return 0;
                }

                set rotation(value) {
                }

                get isInPresentationMode() {
                    return false;
                }

                async goToDestination(dest) {
                }

                goToPage(val) {
                }

                addLinkAttributes(link, url, newWindow = false) {
                    addLinkAttributes(link, {
                        url,
                        enabled: this.externalLinkEnabled
                    });
                }

                getDestinationHash(dest) {
                    return "#";
                }

                getAnchorUrl(hash) {
                    return "#";
                }

                setHash(hash) {
                }

                executeNamedAction(action) {
                }

                executeSetOCGState(action) {
                }

                cachePageRef(pageNum, pageRef) {
                }
            }

            exports.SimpleLinkService = SimpleLinkService;

            /***/
        }),
        /* 8 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.AltTextManager = void 0;
            var _pdfjsLib = __webpack_require__(4);

            class AltTextManager {
                #boundUpdateUIState = this.#updateUIState.bind(this);
                #boundSetPosition = this.#setPosition.bind(this);
                #boundOnClick = this.#onClick.bind(this);
                #currentEditor = null;
                #cancelButton;
                #dialog;
                #eventBus;
                #hasUsedPointer = false;
                #optionDescription;
                #optionDecorative;
                #overlayManager;
                #saveButton;
                #textarea;
                #uiManager;
                #previousAltText = null;
                #svgElement = null;
                #rectElement = null;
                #container;
                #telemetryData = null;

                constructor({
                                dialog,
                                optionDescription,
                                optionDecorative,
                                textarea,
                                cancelButton,
                                saveButton
                            }, container, overlayManager, eventBus) {
                    this.#dialog = dialog;
                    this.#optionDescription = optionDescription;
                    this.#optionDecorative = optionDecorative;
                    this.#textarea = textarea;
                    this.#cancelButton = cancelButton;
                    this.#saveButton = saveButton;
                    this.#overlayManager = overlayManager;
                    this.#eventBus = eventBus;
                    this.#container = container;
                    dialog.addEventListener("close", this.#close.bind(this));
                    dialog.addEventListener("contextmenu", event => {
                        if (event.target !== this.#textarea) {
                            event.preventDefault();
                        }
                    });
                    cancelButton.addEventListener("click", this.#finish.bind(this));
                    saveButton.addEventListener("click", this.#save.bind(this));
                    optionDescription.addEventListener("change", this.#boundUpdateUIState);
                    optionDecorative.addEventListener("change", this.#boundUpdateUIState);
                    this.#overlayManager.register(dialog);
                }

                get _elements() {
                    return (0, _pdfjsLib.shadow)(this, "_elements", [this.#optionDescription, this.#optionDecorative, this.#textarea, this.#saveButton, this.#cancelButton]);
                }

                #createSVGElement() {
                    if (this.#svgElement) {
                        return;
                    }
                    const svgFactory = new _pdfjsLib.DOMSVGFactory();
                    const svg = this.#svgElement = svgFactory.createElement("svg");
                    svg.setAttribute("width", "0");
                    svg.setAttribute("height", "0");
                    const defs = svgFactory.createElement("defs");
                    svg.append(defs);
                    const mask = svgFactory.createElement("mask");
                    defs.append(mask);
                    mask.setAttribute("id", "alttext-manager-mask");
                    mask.setAttribute("maskContentUnits", "objectBoundingBox");
                    let rect = svgFactory.createElement("rect");
                    mask.append(rect);
                    rect.setAttribute("fill", "white");
                    rect.setAttribute("width", "1");
                    rect.setAttribute("height", "1");
                    rect.setAttribute("x", "0");
                    rect.setAttribute("y", "0");
                    rect = this.#rectElement = svgFactory.createElement("rect");
                    mask.append(rect);
                    rect.setAttribute("fill", "black");
                    this.#dialog.append(svg);
                }

                async editAltText(uiManager, editor) {
                    if (this.#currentEditor || !editor) {
                        return;
                    }
                    this.#createSVGElement();
                    this.#hasUsedPointer = false;
                    for (const element of this._elements) {
                        element.addEventListener("click", this.#boundOnClick);
                    }
                    const {
                        altText,
                        decorative
                    } = editor.altTextData;
                    if (decorative === true) {
                        this.#optionDecorative.checked = true;
                        this.#optionDescription.checked = false;
                    } else {
                        this.#optionDecorative.checked = false;
                        this.#optionDescription.checked = true;
                    }
                    this.#previousAltText = this.#textarea.value = altText?.trim() || "";
                    this.#updateUIState();
                    this.#currentEditor = editor;
                    this.#uiManager = uiManager;
                    this.#uiManager.removeEditListeners();
                    this.#eventBus._on("resize", this.#boundSetPosition);
                    try {
                        await this.#overlayManager.open(this.#dialog);
                        this.#setPosition();
                    } catch (ex) {
                        this.#close();
                        throw ex;
                    }
                }

                #setPosition() {
                    if (!this.#currentEditor) {
                        return;
                    }
                    const dialog = this.#dialog;
                    const {
                        style
                    } = dialog;
                    const {
                        x: containerX,
                        y: containerY,
                        width: containerW,
                        height: containerH
                    } = this.#container.getBoundingClientRect();
                    const {
                        innerWidth: windowW,
                        innerHeight: windowH
                    } = window;
                    const {
                        width: dialogW,
                        height: dialogH
                    } = dialog.getBoundingClientRect();
                    const {
                        x,
                        y,
                        width,
                        height
                    } = this.#currentEditor.getClientDimensions();
                    const MARGIN = 10;
                    const isLTR = this.#uiManager.direction === "ltr";
                    const xs = Math.max(x, containerX);
                    const xe = Math.min(x + width, containerX + containerW);
                    const ys = Math.max(y, containerY);
                    const ye = Math.min(y + height, containerY + containerH);
                    this.#rectElement.setAttribute("width", `${(xe - xs) / windowW}`);
                    this.#rectElement.setAttribute("height", `${(ye - ys) / windowH}`);
                    this.#rectElement.setAttribute("x", `${xs / windowW}`);
                    this.#rectElement.setAttribute("y", `${ys / windowH}`);
                    let left = null;
                    let top = Math.max(y, 0);
                    top += Math.min(windowH - (top + dialogH), 0);
                    if (isLTR) {
                        if (x + width + MARGIN + dialogW < windowW) {
                            left = x + width + MARGIN;
                        } else if (x > dialogW + MARGIN) {
                            left = x - dialogW - MARGIN;
                        }
                    } else if (x > dialogW + MARGIN) {
                        left = x - dialogW - MARGIN;
                    } else if (x + width + MARGIN + dialogW < windowW) {
                        left = x + width + MARGIN;
                    }
                    if (left === null) {
                        top = null;
                        left = Math.max(x, 0);
                        left += Math.min(windowW - (left + dialogW), 0);
                        if (y > dialogH + MARGIN) {
                            top = y - dialogH - MARGIN;
                        } else if (y + height + MARGIN + dialogH < windowH) {
                            top = y + height + MARGIN;
                        }
                    }
                    if (top !== null) {
                        dialog.classList.add("positioned");
                        if (isLTR) {
                            style.left = `${left}px`;
                        } else {
                            style.right = `${windowW - left - dialogW}px`;
                        }
                        style.top = `${top}px`;
                    } else {
                        dialog.classList.remove("positioned");
                        style.left = "";
                        style.top = "";
                    }
                }

                #finish() {
                    if (this.#overlayManager.active === this.#dialog) {
                        this.#overlayManager.close(this.#dialog);
                    }
                }

                #close() {
                    this.#eventBus.dispatch("reporttelemetry", {
                        source: this,
                        details: {
                            type: "editing",
                            subtype: this.#currentEditor.editorType,
                            data: this.#telemetryData || {
                                action: "alt_text_cancel",
                                alt_text_keyboard: !this.#hasUsedPointer
                            }
                        }
                    });
                    this.#telemetryData = null;
                    this.#removeOnClickListeners();
                    this.#uiManager?.addEditListeners();
                    this.#eventBus._off("resize", this.#boundSetPosition);
                    this.#currentEditor = null;
                    this.#uiManager = null;
                }

                #updateUIState() {
                    this.#textarea.disabled = this.#optionDecorative.checked;
                }

                #save() {
                    const altText = this.#textarea.value.trim();
                    const decorative = this.#optionDecorative.checked;
                    this.#currentEditor.altTextData = {
                        altText,
                        decorative
                    };
                    this.#telemetryData = {
                        action: "alt_text_save",
                        alt_text_description: !!altText,
                        alt_text_edit: !!this.#previousAltText && this.#previousAltText !== altText,
                        alt_text_decorative: decorative,
                        alt_text_keyboard: !this.#hasUsedPointer
                    };
                    this.#finish();
                }

                #onClick(evt) {
                    if (evt.detail === 0) {
                        return;
                    }
                    this.#hasUsedPointer = true;
                    this.#removeOnClickListeners();
                }

                #removeOnClickListeners() {
                    for (const element of this._elements) {
                        element.removeEventListener("click", this.#boundOnClick);
                    }
                }

                destroy() {
                    this.#uiManager = null;
                    this.#finish();
                    this.#svgElement?.remove();
                    this.#svgElement = this.#rectElement = null;
                }
            }

            exports.AltTextManager = AltTextManager;

            /***/
        }),
        /* 9 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.AnnotationEditorParams = void 0;
            var _pdfjsLib = __webpack_require__(4);

            class AnnotationEditorParams {
                constructor(options, eventBus) {
                    this.eventBus = eventBus;
                    this.#bindListeners(options);
                }

                #bindListeners({
                                   editorFreeTextFontSize,
                                   editorFreeTextColor,
                                   editorInkColor,
                                   editorInkThickness,
                                   editorInkOpacity,
                                   editorStampAddImage
                               }) {
                    const dispatchEvent = (typeStr, value) => {
                        this.eventBus.dispatch("switchannotationeditorparams", {
                            source: this,
                            type: _pdfjsLib.AnnotationEditorParamsType[typeStr],
                            value
                        });
                    };
                    editorFreeTextFontSize.addEventListener("input", function () {
                        dispatchEvent("FREETEXT_SIZE", this.valueAsNumber);
                    });
                    editorFreeTextColor.addEventListener("input", function () {
                        dispatchEvent("FREETEXT_COLOR", this.value);
                    });
                    editorInkColor.addEventListener("input", function () {
                        dispatchEvent("INK_COLOR", this.value);
                    });
                    editorInkThickness.addEventListener("input", function () {
                        dispatchEvent("INK_THICKNESS", this.valueAsNumber);
                    });
                    editorInkOpacity.addEventListener("input", function () {
                        dispatchEvent("INK_OPACITY", this.valueAsNumber);
                    });
                    editorStampAddImage.addEventListener("click", () => {
                        dispatchEvent("CREATE");
                    });
                    this.eventBus._on("annotationeditorparamschanged", evt => {
                        for (const [type, value] of evt.details) {
                            switch (type) {
                                case _pdfjsLib.AnnotationEditorParamsType.FREETEXT_SIZE:
                                    editorFreeTextFontSize.value = value;
                                    break;
                                case _pdfjsLib.AnnotationEditorParamsType.FREETEXT_COLOR:
                                    editorFreeTextColor.value = value;
                                    break;
                                case _pdfjsLib.AnnotationEditorParamsType.INK_COLOR:
                                    editorInkColor.value = value;
                                    break;
                                case _pdfjsLib.AnnotationEditorParamsType.INK_THICKNESS:
                                    editorInkThickness.value = value;
                                    break;
                                case _pdfjsLib.AnnotationEditorParamsType.INK_OPACITY:
                                    editorInkOpacity.value = value;
                                    break;
                            }
                        }
                    });
                }
            }

            exports.AnnotationEditorParams = AnnotationEditorParams;

            /***/
        }),
        /* 10 */
        /***/ ((__unused_webpack_module, exports) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.OverlayManager = void 0;

            class OverlayManager {
                #overlays = new WeakMap();
                #active = null;
                get active() {
                    return this.#active;
                }

                async register(dialog, canForceClose = false) {
                    if (typeof dialog !== "object") {
                        throw new Error("Not enough parameters.");
                    } else if (this.#overlays.has(dialog)) {
                        throw new Error("The overlay is already registered.");
                    }
                    this.#overlays.set(dialog, {
                        canForceClose
                    });
                    dialog.addEventListener("cancel", evt => {
                        this.#active = null;
                    });
                }

                async open(dialog) {
                    if (!this.#overlays.has(dialog)) {
                        throw new Error("The overlay does not exist.");
                    } else if (this.#active) {
                        if (this.#active === dialog) {
                            throw new Error("The overlay is already active.");
                        } else if (this.#overlays.get(dialog).canForceClose) {
                            await this.close();
                        } else {
                            throw new Error("Another overlay is currently active.");
                        }
                    }
                    this.#active = dialog;
                    dialog.showModal();
                }

                async close(dialog = this.#active) {
                    if (!this.#overlays.has(dialog)) {
                        throw new Error("The overlay does not exist.");
                    } else if (!this.#active) {
                        throw new Error("The overlay is currently not active.");
                    } else if (this.#active !== dialog) {
                        throw new Error("Another overlay is currently active.");
                    }
                    dialog.close();
                    this.#active = null;
                }
            }

            exports.OverlayManager = OverlayManager;

            /***/
        }),
        /* 11 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PasswordPrompt = void 0;
            var _pdfjsLib = __webpack_require__(4);

            class PasswordPrompt {
                #activeCapability = null;
                #updateCallback = null;
                #reason = null;

                constructor(options, overlayManager, l10n, isViewerEmbedded = false) {
                    this.dialog = options.dialog;
                    this.label = options.label;
                    this.input = options.input;
                    this.submitButton = options.submitButton;
                    this.cancelButton = options.cancelButton;
                    this.overlayManager = overlayManager;
                    this.l10n = l10n;
                    this._isViewerEmbedded = isViewerEmbedded;
                    this.submitButton.addEventListener("click", this.#verify.bind(this));
                    this.cancelButton.addEventListener("click", this.close.bind(this));
                    this.input.addEventListener("keydown", e => {
                        if (e.keyCode === 13) {
                            this.#verify();
                        }
                    });
                    this.overlayManager.register(this.dialog, true);
                    this.dialog.addEventListener("close", this.#cancel.bind(this));
                }

                async open() {
                    if (this.#activeCapability) {
                        await this.#activeCapability.promise;
                    }
                    this.#activeCapability = new _pdfjsLib.PromiseCapability();
                    try {
                        await this.overlayManager.open(this.dialog);
                    } catch (ex) {
                        this.#activeCapability.resolve();
                        throw ex;
                    }
                    const passwordIncorrect = this.#reason === _pdfjsLib.PasswordResponses.INCORRECT_PASSWORD;
                    if (!this._isViewerEmbedded || passwordIncorrect) {
                        this.input.focus();
                    }
                    this.label.textContent = await this.l10n.get(`password_${passwordIncorrect ? "invalid" : "label"}`);
                }

                async close() {
                    if (this.overlayManager.active === this.dialog) {
                        this.overlayManager.close(this.dialog);
                    }
                }

                #verify() {
                    const password = this.input.value;
                    if (password?.length > 0) {
                        this.#invokeCallback(password);
                    }
                }

                #cancel() {
                    this.#invokeCallback(new Error("PasswordPrompt cancelled."));
                    this.#activeCapability.resolve();
                }

                #invokeCallback(password) {
                    if (!this.#updateCallback) {
                        return;
                    }
                    this.close();
                    this.input.value = "";
                    this.#updateCallback(password);
                    this.#updateCallback = null;
                }

                async setUpdateCallback(updateCallback, reason) {
                    if (this.#activeCapability) {
                        await this.#activeCapability.promise;
                    }
                    this.#updateCallback = updateCallback;
                    this.#reason = reason;
                }
            }

            exports.PasswordPrompt = PasswordPrompt;

            /***/
        }),
        /* 12 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PDFAttachmentViewer = void 0;
            var _pdfjsLib = __webpack_require__(4);
            var _base_tree_viewer = __webpack_require__(13);
            var _event_utils = __webpack_require__(6);

            class PDFAttachmentViewer extends _base_tree_viewer.BaseTreeViewer {
                constructor(options) {
                    super(options);
                    this.downloadManager = options.downloadManager;
                    this.eventBus._on("fileattachmentannotation", this.#appendAttachment.bind(this));
                }

                reset(keepRenderedCapability = false) {
                    super.reset();
                    this._attachments = null;
                    if (!keepRenderedCapability) {
                        this._renderedCapability = new _pdfjsLib.PromiseCapability();
                    }
                    this._pendingDispatchEvent = false;
                }

                async _dispatchEvent(attachmentsCount) {
                    this._renderedCapability.resolve();
                    if (attachmentsCount === 0 && !this._pendingDispatchEvent) {
                        this._pendingDispatchEvent = true;
                        await (0, _event_utils.waitOnEventOrTimeout)({
                            target: this.eventBus,
                            name: "annotationlayerrendered",
                            delay: 1000
                        });
                        if (!this._pendingDispatchEvent) {
                            return;
                        }
                    }
                    this._pendingDispatchEvent = false;
                    this.eventBus.dispatch("attachmentsloaded", {
                        source: this,
                        attachmentsCount
                    });
                }

                _bindLink(element, {
                    content,
                    filename
                }) {
                    element.onclick = () => {
                        this.downloadManager.openOrDownloadData(element, content, filename);
                        return false;
                    };
                }

                render({
                           attachments,
                           keepRenderedCapability = false
                       }) {
                    if (this._attachments) {
                        this.reset(keepRenderedCapability);
                    }
                    this._attachments = attachments || null;
                    if (!attachments) {
                        this._dispatchEvent(0);
                        return;
                    }
                    const fragment = document.createDocumentFragment();
                    let attachmentsCount = 0;
                    for (const name in attachments) {
                        const item = attachments[name];
                        const content = item.content,
                            filename = (0, _pdfjsLib.getFilenameFromUrl)(item.filename, true);
                        const div = document.createElement("div");
                        div.className = "treeItem";
                        const element = document.createElement("a");
                        this._bindLink(element, {
                            content,
                            filename
                        });
                        element.textContent = this._normalizeTextContent(filename);
                        div.append(element);
                        fragment.append(div);
                        attachmentsCount++;
                    }
                    this._finishRendering(fragment, attachmentsCount);
                }

                #appendAttachment({
                                      filename,
                                      content
                                  }) {
                    const renderedPromise = this._renderedCapability.promise;
                    renderedPromise.then(() => {
                        if (renderedPromise !== this._renderedCapability.promise) {
                            return;
                        }
                        const attachments = this._attachments || Object.create(null);
                        for (const name in attachments) {
                            if (filename === name) {
                                return;
                            }
                        }
                        attachments[filename] = {
                            filename,
                            content
                        };
                        this.render({
                            attachments,
                            keepRenderedCapability: true
                        });
                    });
                }
            }

            exports.PDFAttachmentViewer = PDFAttachmentViewer;

            /***/
        }),
        /* 13 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.BaseTreeViewer = void 0;
            var _ui_utils = __webpack_require__(3);
            const TREEITEM_OFFSET_TOP = -100;
            const TREEITEM_SELECTED_CLASS = "selected";

            class BaseTreeViewer {
                constructor(options) {
                    if (this.constructor === BaseTreeViewer) {
                        throw new Error("Cannot initialize BaseTreeViewer.");
                    }
                    this.container = options.container;
                    this.eventBus = options.eventBus;
                    this.reset();
                }

                reset() {
                    this._pdfDocument = null;
                    this._lastToggleIsShow = true;
                    this._currentTreeItem = null;
                    this.container.textContent = "";
                    this.container.classList.remove("treeWithDeepNesting");
                }

                _dispatchEvent(count) {
                    throw new Error("Not implemented: _dispatchEvent");
                }

                _bindLink(element, params) {
                    throw new Error("Not implemented: _bindLink");
                }

                _normalizeTextContent(str) {
                    return (0, _ui_utils.removeNullCharacters)(str, true) || "\u2013";
                }

                _addToggleButton(div, hidden = false) {
                    const toggler = document.createElement("div");
                    toggler.className = "treeItemToggler";
                    if (hidden) {
                        toggler.classList.add("treeItemsHidden");
                    }
                    toggler.onclick = evt => {
                        evt.stopPropagation();
                        toggler.classList.toggle("treeItemsHidden");
                        if (evt.shiftKey) {
                            const shouldShowAll = !toggler.classList.contains("treeItemsHidden");
                            this._toggleTreeItem(div, shouldShowAll);
                        }
                    };
                    div.prepend(toggler);
                }

                _toggleTreeItem(root, show = false) {
                    this._lastToggleIsShow = show;
                    for (const toggler of root.querySelectorAll(".treeItemToggler")) {
                        toggler.classList.toggle("treeItemsHidden", !show);
                    }
                }

                _toggleAllTreeItems() {
                    this._toggleTreeItem(this.container, !this._lastToggleIsShow);
                }

                _finishRendering(fragment, count, hasAnyNesting = false) {
                    if (hasAnyNesting) {
                        this.container.classList.add("treeWithDeepNesting");
                        this._lastToggleIsShow = !fragment.querySelector(".treeItemsHidden");
                    }
                    this.container.append(fragment);
                    this._dispatchEvent(count);
                }

                render(params) {
                    throw new Error("Not implemented: render");
                }

                _updateCurrentTreeItem(treeItem = null) {
                    if (this._currentTreeItem) {
                        this._currentTreeItem.classList.remove(TREEITEM_SELECTED_CLASS);
                        this._currentTreeItem = null;
                    }
                    if (treeItem) {
                        treeItem.classList.add(TREEITEM_SELECTED_CLASS);
                        this._currentTreeItem = treeItem;
                    }
                }

                _scrollToCurrentTreeItem(treeItem) {
                    if (!treeItem) {
                        return;
                    }
                    let currentNode = treeItem.parentNode;
                    while (currentNode && currentNode !== this.container) {
                        if (currentNode.classList.contains("treeItem")) {
                            const toggler = currentNode.firstElementChild;
                            toggler?.classList.remove("treeItemsHidden");
                        }
                        currentNode = currentNode.parentNode;
                    }
                    this._updateCurrentTreeItem(treeItem);
                    this.container.scrollTo(treeItem.offsetLeft, treeItem.offsetTop + TREEITEM_OFFSET_TOP);
                }
            }

            exports.BaseTreeViewer = BaseTreeViewer;

            /***/
        }),
        /* 14 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PDFCursorTools = void 0;
            var _pdfjsLib = __webpack_require__(4);
            var _ui_utils = __webpack_require__(3);
            var _grab_to_pan = __webpack_require__(15);

            class PDFCursorTools {
                #active = _ui_utils.CursorTool.SELECT;
                #prevActive = null;

                constructor({
                                container,
                                eventBus,
                                cursorToolOnLoad = _ui_utils.CursorTool.SELECT
                            }) {
                    this.container = container;
                    this.eventBus = eventBus;
                    this.#addEventListeners();
                    Promise.resolve().then(() => {
                        this.switchTool(cursorToolOnLoad);
                    });
                }

                get activeTool() {
                    return this.#active;
                }

                switchTool(tool) {
                    if (this.#prevActive !== null) {
                        return;
                    }
                    if (tool === this.#active) {
                        return;
                    }
                    const disableActiveTool = () => {
                        switch (this.#active) {
                            case _ui_utils.CursorTool.SELECT:
                                break;
                            case _ui_utils.CursorTool.HAND:
                                this._handTool.deactivate();
                                break;
                            case _ui_utils.CursorTool.ZOOM:
                        }
                    };
                    switch (tool) {
                        case _ui_utils.CursorTool.SELECT:
                            disableActiveTool();
                            break;
                        case _ui_utils.CursorTool.HAND:
                            disableActiveTool();
                            this._handTool.activate();
                            break;
                        case _ui_utils.CursorTool.ZOOM:
                        default:
                            console.error(`switchTool: "${tool}" is an unsupported value.`);
                            return;
                    }
                    this.#active = tool;
                    this.eventBus.dispatch("cursortoolchanged", {
                        source: this,
                        tool
                    });
                }

                #addEventListeners() {
                    this.eventBus._on("switchcursortool", evt => {
                        this.switchTool(evt.tool);
                    });
                    let annotationEditorMode = _pdfjsLib.AnnotationEditorType.NONE,
                        presentationModeState = _ui_utils.PresentationModeState.NORMAL;
                    const disableActive = () => {
                        const prevActive = this.#active;
                        this.switchTool(_ui_utils.CursorTool.SELECT);
                        this.#prevActive ??= prevActive;
                    };
                    const enableActive = () => {
                        const prevActive = this.#prevActive;
                        if (prevActive !== null && annotationEditorMode === _pdfjsLib.AnnotationEditorType.NONE && presentationModeState === _ui_utils.PresentationModeState.NORMAL) {
                            this.#prevActive = null;
                            this.switchTool(prevActive);
                        }
                    };
                    this.eventBus._on("secondarytoolbarreset", evt => {
                        if (this.#prevActive !== null) {
                            annotationEditorMode = _pdfjsLib.AnnotationEditorType.NONE;
                            presentationModeState = _ui_utils.PresentationModeState.NORMAL;
                            enableActive();
                        }
                    });
                    this.eventBus._on("annotationeditormodechanged", ({
                                                                          mode
                                                                      }) => {
                        annotationEditorMode = mode;
                        if (mode === _pdfjsLib.AnnotationEditorType.NONE) {
                            enableActive();
                        } else {
                            disableActive();
                        }
                    });
                    this.eventBus._on("presentationmodechanged", ({
                                                                      state
                                                                  }) => {
                        presentationModeState = state;
                        if (state === _ui_utils.PresentationModeState.NORMAL) {
                            enableActive();
                        } else if (state === _ui_utils.PresentationModeState.FULLSCREEN) {
                            disableActive();
                        }
                    });
                }

                get _handTool() {
                    return (0, _pdfjsLib.shadow)(this, "_handTool", new _grab_to_pan.GrabToPan({
                        element: this.container
                    }));
                }
            }

            exports.PDFCursorTools = PDFCursorTools;

            /***/
        }),
        /* 15 */
        /***/ ((__unused_webpack_module, exports) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.GrabToPan = void 0;
            const CSS_CLASS_GRAB = "grab-to-pan-grab";

            class GrabToPan {
                constructor({
                                element
                            }) {
                    this.element = element;
                    this.document = element.ownerDocument;
                    this.activate = this.activate.bind(this);
                    this.deactivate = this.deactivate.bind(this);
                    this.toggle = this.toggle.bind(this);
                    this._onMouseDown = this.#onMouseDown.bind(this);
                    this._onMouseMove = this.#onMouseMove.bind(this);
                    this._endPan = this.#endPan.bind(this);
                    const overlay = this.overlay = document.createElement("div");
                    overlay.className = "grab-to-pan-grabbing";
                }

                activate() {
                    if (!this.active) {
                        this.active = true;
                        this.element.addEventListener("mousedown", this._onMouseDown, true);
                        this.element.classList.add(CSS_CLASS_GRAB);
                    }
                }

                deactivate() {
                    if (this.active) {
                        this.active = false;
                        this.element.removeEventListener("mousedown", this._onMouseDown, true);
                        this._endPan();
                        this.element.classList.remove(CSS_CLASS_GRAB);
                    }
                }

                toggle() {
                    if (this.active) {
                        this.deactivate();
                    } else {
                        this.activate();
                    }
                }

                ignoreTarget(node) {
                    return node.matches("a[href], a[href] *, input, textarea, button, button *, select, option");
                }

                #onMouseDown(event) {
                    if (event.button !== 0 || this.ignoreTarget(event.target)) {
                        return;
                    }
                    if (event.originalTarget) {
                        try {
                            event.originalTarget.tagName;
                        } catch {
                            return;
                        }
                    }
                    this.scrollLeftStart = this.element.scrollLeft;
                    this.scrollTopStart = this.element.scrollTop;
                    this.clientXStart = event.clientX;
                    this.clientYStart = event.clientY;
                    this.document.addEventListener("mousemove", this._onMouseMove, true);
                    this.document.addEventListener("mouseup", this._endPan, true);
                    this.element.addEventListener("scroll", this._endPan, true);
                    event.preventDefault();
                    event.stopPropagation();
                    const focusedElement = document.activeElement;
                    if (focusedElement && !focusedElement.contains(event.target)) {
                        focusedElement.blur();
                    }
                }

                #onMouseMove(event) {
                    this.element.removeEventListener("scroll", this._endPan, true);
                    if (!(event.buttons & 1)) {
                        this._endPan();
                        return;
                    }
                    const xDiff = event.clientX - this.clientXStart;
                    const yDiff = event.clientY - this.clientYStart;
                    this.element.scrollTo({
                        top: this.scrollTopStart - yDiff,
                        left: this.scrollLeftStart - xDiff,
                        behavior: "instant"
                    });
                    if (!this.overlay.parentNode) {
                        document.body.append(this.overlay);
                    }
                }

                #endPan() {
                    this.element.removeEventListener("scroll", this._endPan, true);
                    this.document.removeEventListener("mousemove", this._onMouseMove, true);
                    this.document.removeEventListener("mouseup", this._endPan, true);
                    this.overlay.remove();
                }
            }

            exports.GrabToPan = GrabToPan;

            /***/
        }),
        /* 16 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PDFDocumentProperties = void 0;
            var _ui_utils = __webpack_require__(3);
            var _pdfjsLib = __webpack_require__(4);
            const DEFAULT_FIELD_CONTENT = "-";
            const NON_METRIC_LOCALES = ["en-us", "en-lr", "my"];
            const US_PAGE_NAMES = {
                "8.5x11": "Letter",
                "8.5x14": "Legal"
            };
            const METRIC_PAGE_NAMES = {
                "297x420": "A3",
                "210x297": "A4"
            };

            function getPageName(size, isPortrait, pageNames) {
                const width = isPortrait ? size.width : size.height;
                const height = isPortrait ? size.height : size.width;
                return pageNames[`${width}x${height}`];
            }

            class PDFDocumentProperties {
                #fieldData = null;

                constructor({
                                dialog,
                                fields,
                                closeButton
                            }, overlayManager, eventBus, l10n, fileNameLookup) {
                    this.dialog = dialog;
                    this.fields = fields;
                    this.overlayManager = overlayManager;
                    this.l10n = l10n;
                    this._fileNameLookup = fileNameLookup;
                    this.#reset();
                    closeButton.addEventListener("click", this.close.bind(this));
                    this.overlayManager.register(this.dialog);
                    eventBus._on("pagechanging", evt => {
                        this._currentPageNumber = evt.pageNumber;
                    });
                    eventBus._on("rotationchanging", evt => {
                        this._pagesRotation = evt.pagesRotation;
                    });
                    this._isNonMetricLocale = true;
                    l10n.getLanguage().then(locale => {
                        this._isNonMetricLocale = NON_METRIC_LOCALES.includes(locale);
                    });
                }

                async open() {
                    await Promise.all([this.overlayManager.open(this.dialog), this._dataAvailableCapability.promise]);
                    const currentPageNumber = this._currentPageNumber;
                    const pagesRotation = this._pagesRotation;
                    if (this.#fieldData && currentPageNumber === this.#fieldData._currentPageNumber && pagesRotation === this.#fieldData._pagesRotation) {
                        this.#updateUI();
                        return;
                    }
                    const {
                        info,
                        contentLength
                    } = await this.pdfDocument.getMetadata();
                    const [fileName, fileSize, creationDate, modificationDate, pageSize, isLinearized] = await Promise.all([this._fileNameLookup(), this.#parseFileSize(contentLength), this.#parseDate(info.CreationDate), this.#parseDate(info.ModDate), this.pdfDocument.getPage(currentPageNumber).then(pdfPage => {
                        return this.#parsePageSize((0, _ui_utils.getPageSizeInches)(pdfPage), pagesRotation);
                    }), this.#parseLinearization(info.IsLinearized)]);
                    this.#fieldData = Object.freeze({
                        fileName,
                        fileSize,
                        title: info.Title,
                        author: info.Author,
                        subject: info.Subject,
                        keywords: info.Keywords,
                        creationDate,
                        modificationDate,
                        creator: info.Creator,
                        producer: info.Producer,
                        version: info.PDFFormatVersion,
                        pageCount: this.pdfDocument.numPages,
                        pageSize,
                        linearized: isLinearized,
                        _currentPageNumber: currentPageNumber,
                        _pagesRotation: pagesRotation
                    });
                    this.#updateUI();
                    const {
                        length
                    } = await this.pdfDocument.getDownloadInfo();
                    if (contentLength === length) {
                        return;
                    }
                    const data = Object.assign(Object.create(null), this.#fieldData);
                    data.fileSize = await this.#parseFileSize(length);
                    this.#fieldData = Object.freeze(data);
                    this.#updateUI();
                }

                async close() {
                    this.overlayManager.close(this.dialog);
                }

                setDocument(pdfDocument) {
                    if (this.pdfDocument) {
                        this.#reset();
                        this.#updateUI(true);
                    }
                    if (!pdfDocument) {
                        return;
                    }
                    this.pdfDocument = pdfDocument;
                    this._dataAvailableCapability.resolve();
                }

                #reset() {
                    this.pdfDocument = null;
                    this.#fieldData = null;
                    this._dataAvailableCapability = new _pdfjsLib.PromiseCapability();
                    this._currentPageNumber = 1;
                    this._pagesRotation = 0;
                }

                #updateUI(reset = false) {
                    if (reset || !this.#fieldData) {
                        for (const id in this.fields) {
                            this.fields[id].textContent = DEFAULT_FIELD_CONTENT;
                        }
                        return;
                    }
                    if (this.overlayManager.active !== this.dialog) {
                        return;
                    }
                    for (const id in this.fields) {
                        const content = this.#fieldData[id];
                        this.fields[id].textContent = content || content === 0 ? content : DEFAULT_FIELD_CONTENT;
                    }
                }

                async #parseFileSize(fileSize = 0) {
                    const kb = fileSize / 1024,
                        mb = kb / 1024;
                    if (!kb) {
                        return undefined;
                    }
                    return this.l10n.get(`document_properties_${mb >= 1 ? "mb" : "kb"}`, {
                        size_mb: mb >= 1 && (+mb.toPrecision(3)).toLocaleString(),
                        size_kb: mb < 1 && (+kb.toPrecision(3)).toLocaleString(),
                        size_b: fileSize.toLocaleString()
                    });
                }

                async #parsePageSize(pageSizeInches, pagesRotation) {
                    if (!pageSizeInches) {
                        return undefined;
                    }
                    if (pagesRotation % 180 !== 0) {
                        pageSizeInches = {
                            width: pageSizeInches.height,
                            height: pageSizeInches.width
                        };
                    }
                    const isPortrait = (0, _ui_utils.isPortraitOrientation)(pageSizeInches);
                    let sizeInches = {
                        width: Math.round(pageSizeInches.width * 100) / 100,
                        height: Math.round(pageSizeInches.height * 100) / 100
                    };
                    let sizeMillimeters = {
                        width: Math.round(pageSizeInches.width * 25.4 * 10) / 10,
                        height: Math.round(pageSizeInches.height * 25.4 * 10) / 10
                    };
                    let rawName = getPageName(sizeInches, isPortrait, US_PAGE_NAMES) || getPageName(sizeMillimeters, isPortrait, METRIC_PAGE_NAMES);
                    if (!rawName && !(Number.isInteger(sizeMillimeters.width) && Number.isInteger(sizeMillimeters.height))) {
                        const exactMillimeters = {
                            width: pageSizeInches.width * 25.4,
                            height: pageSizeInches.height * 25.4
                        };
                        const intMillimeters = {
                            width: Math.round(sizeMillimeters.width),
                            height: Math.round(sizeMillimeters.height)
                        };
                        if (Math.abs(exactMillimeters.width - intMillimeters.width) < 0.1 && Math.abs(exactMillimeters.height - intMillimeters.height) < 0.1) {
                            rawName = getPageName(intMillimeters, isPortrait, METRIC_PAGE_NAMES);
                            if (rawName) {
                                sizeInches = {
                                    width: Math.round(intMillimeters.width / 25.4 * 100) / 100,
                                    height: Math.round(intMillimeters.height / 25.4 * 100) / 100
                                };
                                sizeMillimeters = intMillimeters;
                            }
                        }
                    }
                    const [{
                        width,
                        height
                    }, unit, name, orientation] = await Promise.all([this._isNonMetricLocale ? sizeInches : sizeMillimeters, this.l10n.get(`document_properties_page_size_unit_${this._isNonMetricLocale ? "inches" : "millimeters"}`), rawName && this.l10n.get(`document_properties_page_size_name_${rawName.toLowerCase()}`), this.l10n.get(`document_properties_page_size_orientation_${isPortrait ? "portrait" : "landscape"}`)]);
                    return this.l10n.get(`document_properties_page_size_dimension_${name ? "name_" : ""}string`, {
                        width: width.toLocaleString(),
                        height: height.toLocaleString(),
                        unit,
                        name,
                        orientation
                    });
                }

                async #parseDate(inputDate) {
                    const dateObject = _pdfjsLib.PDFDateString.toDateObject(inputDate);
                    if (!dateObject) {
                        return undefined;
                    }
                    return this.l10n.get("document_properties_date_string", {
                        date: dateObject.toLocaleDateString(),
                        time: dateObject.toLocaleTimeString()
                    });
                }

                #parseLinearization(isLinearized) {
                    return this.l10n.get(`document_properties_linearized_${isLinearized ? "yes" : "no"}`);
                }
            }

            exports.PDFDocumentProperties = PDFDocumentProperties;

            /***/
        }),
        /* 17 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PDFFindBar = void 0;
            var _pdf_find_controller = __webpack_require__(18);
            var _ui_utils = __webpack_require__(3);
            const MATCHES_COUNT_LIMIT = 1000;

            class PDFFindBar {
                constructor(options, eventBus, l10n) {
                    this.opened = false;
                    this.bar = options.bar;
                    this.toggleButton = options.toggleButton;
                    this.findField = options.findField;
                    this.highlightAll = options.highlightAllCheckbox;
                    this.caseSensitive = options.caseSensitiveCheckbox;
                    this.matchDiacritics = options.matchDiacriticsCheckbox;
                    this.entireWord = options.entireWordCheckbox;
                    this.findMsg = options.findMsg;
                    this.findResultsCount = options.findResultsCount;
                    this.findPreviousButton = options.findPreviousButton;
                    this.findNextButton = options.findNextButton;
                    this.eventBus = eventBus;
                    this.l10n = l10n;
                    this.toggleButton.addEventListener("click", () => {
                        this.toggle();
                    });
                    this.findField.addEventListener("input", () => {
                        this.dispatchEvent("");
                    });
                    this.bar.addEventListener("keydown", e => {
                        switch (e.keyCode) {
                            case 13:
                                if (e.target === this.findField) {
                                    this.dispatchEvent("again", e.shiftKey);
                                }
                                break;
                            case 27:
                                this.close();
                                break;
                        }
                    });
                    this.findPreviousButton.addEventListener("click", () => {
                        this.dispatchEvent("again", true);
                    });
                    this.findNextButton.addEventListener("click", () => {
                        this.dispatchEvent("again", false);
                    });
                    this.highlightAll.addEventListener("click", () => {
                        this.dispatchEvent("highlightallchange");
                    });
                    this.caseSensitive.addEventListener("click", () => {
                        this.dispatchEvent("casesensitivitychange");
                    });
                    this.entireWord.addEventListener("click", () => {
                        this.dispatchEvent("entirewordchange");
                    });
                    this.matchDiacritics.addEventListener("click", () => {
                        this.dispatchEvent("diacriticmatchingchange");
                    });
                    this.eventBus._on("resize", this.#adjustWidth.bind(this));
                }

                reset() {
                    this.updateUIState();
                }

                dispatchEvent(type, findPrev = false) {
                    this.eventBus.dispatch("find", {
                        source: this,
                        type,
                        query: this.findField.value,
                        caseSensitive: this.caseSensitive.checked,
                        entireWord: this.entireWord.checked,
                        highlightAll: this.highlightAll.checked,
                        findPrevious: findPrev,
                        matchDiacritics: this.matchDiacritics.checked
                    });
                }

                updateUIState(state, previous, matchesCount) {
                    let findMsg = Promise.resolve("");
                    let status = "";
                    switch (state) {
                        case _pdf_find_controller.FindState.FOUND:
                            break;
                        case _pdf_find_controller.FindState.PENDING:
                            status = "pending";
                            break;
                        case _pdf_find_controller.FindState.NOT_FOUND:
                            findMsg = this.l10n.get("find_not_found");
                            status = "notFound";
                            break;
                        case _pdf_find_controller.FindState.WRAPPED:
                            findMsg = this.l10n.get(`find_reached_${previous ? "top" : "bottom"}`);
                            break;
                    }
                    this.findField.setAttribute("data-status", status);
                    this.findField.setAttribute("aria-invalid", state === _pdf_find_controller.FindState.NOT_FOUND);
                    findMsg.then(msg => {
                        this.findMsg.setAttribute("data-status", status);
                        this.findMsg.textContent = msg;
                        this.#adjustWidth();
                    });
                    this.updateResultsCount(matchesCount);
                }

                updateResultsCount({
                                       current = 0,
                                       total = 0
                                   } = {}) {
                    const limit = MATCHES_COUNT_LIMIT;
                    let matchCountMsg = Promise.resolve("");
                    if (total > 0) {
                        if (total > limit) {
                            let key = "find_match_count_limit";
                            matchCountMsg = this.l10n.get(key, {
                                limit
                            });
                        } else {
                            let key = "find_match_count";
                            matchCountMsg = this.l10n.get(key, {
                                current,
                                total
                            });
                        }
                    }
                    matchCountMsg.then(msg => {
                        this.findResultsCount.textContent = msg;
                        this.#adjustWidth();
                    });
                }

                open() {
                    if (!this.opened) {
                        this.opened = true;
                        (0, _ui_utils.toggleExpandedBtn)(this.toggleButton, true, this.bar);
                    }
                    this.findField.select();
                    this.findField.focus();
                    this.#adjustWidth();
                }

                close() {
                    if (!this.opened) {
                        return;
                    }
                    this.opened = false;
                    (0, _ui_utils.toggleExpandedBtn)(this.toggleButton, false, this.bar);
                    this.eventBus.dispatch("findbarclose", {
                        source: this
                    });
                }

                toggle() {
                    if (this.opened) {
                        this.close();
                    } else {
                        this.open();
                    }
                }

                #adjustWidth() {
                    if (!this.opened) {
                        return;
                    }
                    this.bar.classList.remove("wrapContainers");
                    const findbarHeight = this.bar.clientHeight;
                    const inputContainerHeight = this.bar.firstElementChild.clientHeight;
                    if (findbarHeight > inputContainerHeight) {
                        this.bar.classList.add("wrapContainers");
                    }
                }
            }

            exports.PDFFindBar = PDFFindBar;

            /***/
        }),
        /* 18 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PDFFindController = exports.FindState = void 0;
            var _ui_utils = __webpack_require__(3);
            var _pdf_find_utils = __webpack_require__(19);
            var _pdfjsLib = __webpack_require__(4);
            const FindState = {
                FOUND: 0,
                NOT_FOUND: 1,
                WRAPPED: 2,
                PENDING: 3
            };
            exports.FindState = FindState;
            const FIND_TIMEOUT = 250;
            const MATCH_SCROLL_OFFSET_TOP = -50;
            const MATCH_SCROLL_OFFSET_LEFT = -400;
            const CHARACTERS_TO_NORMALIZE = {
                "\u2010": "-",
                "\u2018": "'",
                "\u2019": "'",
                "\u201A": "'",
                "\u201B": "'",
                "\u201C": '"',
                "\u201D": '"',
                "\u201E": '"',
                "\u201F": '"',
                "\u00BC": "1/4",
                "\u00BD": "1/2",
                "\u00BE": "3/4"
            };
            const DIACRITICS_EXCEPTION = new Set([0x3099, 0x309a, 0x094d, 0x09cd, 0x0a4d, 0x0acd, 0x0b4d, 0x0bcd, 0x0c4d, 0x0ccd, 0x0d3b, 0x0d3c, 0x0d4d, 0x0dca, 0x0e3a, 0x0eba, 0x0f84, 0x1039, 0x103a, 0x1714, 0x1734, 0x17d2, 0x1a60, 0x1b44, 0x1baa, 0x1bab, 0x1bf2, 0x1bf3, 0x2d7f, 0xa806, 0xa82c, 0xa8c4, 0xa953, 0xa9c0, 0xaaf6, 0xabed, 0x0c56, 0x0f71, 0x0f72, 0x0f7a, 0x0f7b, 0x0f7c, 0x0f7d, 0x0f80, 0x0f74]);
            let DIACRITICS_EXCEPTION_STR;
            const DIACRITICS_REG_EXP = /\p{M}+/gu;
            const SPECIAL_CHARS_REG_EXP = /([.*+?^${}()|[\]\\])|(\p{P})|(\s+)|(\p{M})|(\p{L})/gu;
            const NOT_DIACRITIC_FROM_END_REG_EXP = /([^\p{M}])\p{M}*$/u;
            const NOT_DIACRITIC_FROM_START_REG_EXP = /^\p{M}*([^\p{M}])/u;
            const SYLLABLES_REG_EXP = /[\uAC00-\uD7AF\uFA6C\uFACF-\uFAD1\uFAD5-\uFAD7]+/g;
            const SYLLABLES_LENGTHS = new Map();
            const FIRST_CHAR_SYLLABLES_REG_EXP = "[\\u1100-\\u1112\\ud7a4-\\ud7af\\ud84a\\ud84c\\ud850\\ud854\\ud857\\ud85f]";
            const NFKC_CHARS_TO_NORMALIZE = new Map();
            let noSyllablesRegExp = null;
            let withSyllablesRegExp = null;

            function normalize(text) {
                const syllablePositions = [];
                let m;
                while ((m = SYLLABLES_REG_EXP.exec(text)) !== null) {
                    let {
                        index
                    } = m;
                    for (const char of m[0]) {
                        let len = SYLLABLES_LENGTHS.get(char);
                        if (!len) {
                            len = char.normalize("NFD").length;
                            SYLLABLES_LENGTHS.set(char, len);
                        }
                        syllablePositions.push([len, index++]);
                    }
                }
                let normalizationRegex;
                if (syllablePositions.length === 0 && noSyllablesRegExp) {
                    normalizationRegex = noSyllablesRegExp;
                } else if (syllablePositions.length > 0 && withSyllablesRegExp) {
                    normalizationRegex = withSyllablesRegExp;
                } else {
                    const replace = Object.keys(CHARACTERS_TO_NORMALIZE).join("");
                    const toNormalizeWithNFKC = (0, _pdf_find_utils.getNormalizeWithNFKC)();
                    const CJK = "(?:\\p{Ideographic}|[\u3040-\u30FF])";
                    const HKDiacritics = "(?:\u3099|\u309A)";
                    const regexp = `([${replace}])|([${toNormalizeWithNFKC}])|(${HKDiacritics}\\n)|(\\p{M}+(?:-\\n)?)|(\\S-\\n)|(${CJK}\\n)|(\\n)`;
                    if (syllablePositions.length === 0) {
                        normalizationRegex = noSyllablesRegExp = new RegExp(regexp + "|(\\u0000)", "gum");
                    } else {
                        normalizationRegex = withSyllablesRegExp = new RegExp(regexp + `|(${FIRST_CHAR_SYLLABLES_REG_EXP})`, "gum");
                    }
                }
                const rawDiacriticsPositions = [];
                while ((m = DIACRITICS_REG_EXP.exec(text)) !== null) {
                    rawDiacriticsPositions.push([m[0].length, m.index]);
                }
                let normalized = text.normalize("NFD");
                const positions = [[0, 0]];
                let rawDiacriticsIndex = 0;
                let syllableIndex = 0;
                let shift = 0;
                let shiftOrigin = 0;
                let eol = 0;
                let hasDiacritics = false;
                normalized = normalized.replace(normalizationRegex, (match, p1, p2, p3, p4, p5, p6, p7, p8, i) => {
                    i -= shiftOrigin;
                    if (p1) {
                        const replacement = CHARACTERS_TO_NORMALIZE[p1];
                        const jj = replacement.length;
                        for (let j = 1; j < jj; j++) {
                            positions.push([i - shift + j, shift - j]);
                        }
                        shift -= jj - 1;
                        return replacement;
                    }
                    if (p2) {
                        let replacement = NFKC_CHARS_TO_NORMALIZE.get(p2);
                        if (!replacement) {
                            replacement = p2.normalize("NFKC");
                            NFKC_CHARS_TO_NORMALIZE.set(p2, replacement);
                        }
                        const jj = replacement.length;
                        for (let j = 1; j < jj; j++) {
                            positions.push([i - shift + j, shift - j]);
                        }
                        shift -= jj - 1;
                        return replacement;
                    }
                    if (p3) {
                        hasDiacritics = true;
                        if (i + eol === rawDiacriticsPositions[rawDiacriticsIndex]?.[1]) {
                            ++rawDiacriticsIndex;
                        } else {
                            positions.push([i - 1 - shift + 1, shift - 1]);
                            shift -= 1;
                            shiftOrigin += 1;
                        }
                        positions.push([i - shift + 1, shift]);
                        shiftOrigin += 1;
                        eol += 1;
                        return p3.charAt(0);
                    }
                    if (p4) {
                        const hasTrailingDashEOL = p4.endsWith("\n");
                        const len = hasTrailingDashEOL ? p4.length - 2 : p4.length;
                        hasDiacritics = true;
                        let jj = len;
                        if (i + eol === rawDiacriticsPositions[rawDiacriticsIndex]?.[1]) {
                            jj -= rawDiacriticsPositions[rawDiacriticsIndex][0];
                            ++rawDiacriticsIndex;
                        }
                        for (let j = 1; j <= jj; j++) {
                            positions.push([i - 1 - shift + j, shift - j]);
                        }
                        shift -= jj;
                        shiftOrigin += jj;
                        if (hasTrailingDashEOL) {
                            i += len - 1;
                            positions.push([i - shift + 1, 1 + shift]);
                            shift += 1;
                            shiftOrigin += 1;
                            eol += 1;
                            return p4.slice(0, len);
                        }
                        return p4;
                    }
                    if (p5) {
                        const len = p5.length - 2;
                        positions.push([i - shift + len, 1 + shift]);
                        shift += 1;
                        shiftOrigin += 1;
                        eol += 1;
                        return p5.slice(0, -2);
                    }
                    if (p6) {
                        const len = p6.length - 1;
                        positions.push([i - shift + len, shift]);
                        shiftOrigin += 1;
                        eol += 1;
                        return p6.slice(0, -1);
                    }
                    if (p7) {
                        positions.push([i - shift + 1, shift - 1]);
                        shift -= 1;
                        shiftOrigin += 1;
                        eol += 1;
                        return " ";
                    }
                    if (i + eol === syllablePositions[syllableIndex]?.[1]) {
                        const newCharLen = syllablePositions[syllableIndex][0] - 1;
                        ++syllableIndex;
                        for (let j = 1; j <= newCharLen; j++) {
                            positions.push([i - (shift - j), shift - j]);
                        }
                        shift -= newCharLen;
                        shiftOrigin += newCharLen;
                    }
                    return p8;
                });
                positions.push([normalized.length, shift]);
                return [normalized, positions, hasDiacritics];
            }

            function getOriginalIndex(diffs, pos, len) {
                if (!diffs) {
                    return [pos, len];
                }
                const start = pos;
                const end = pos + len - 1;
                let i = (0, _ui_utils.binarySearchFirstItem)(diffs, x => x[0] >= start);
                if (diffs[i][0] > start) {
                    --i;
                }
                let j = (0, _ui_utils.binarySearchFirstItem)(diffs, x => x[0] >= end, i);
                if (diffs[j][0] > end) {
                    --j;
                }
                const oldStart = start + diffs[i][1];
                const oldEnd = end + diffs[j][1];
                const oldLen = oldEnd + 1 - oldStart;
                return [oldStart, oldLen];
            }

            class PDFFindController {
                #state = null;
                #updateMatchesCountOnProgress = true;
                #visitedPagesCount = 0;

                constructor({
                                linkService,
                                eventBus,
                                updateMatchesCountOnProgress = true
                            }) {
                    this._linkService = linkService;
                    this._eventBus = eventBus;
                    this.#updateMatchesCountOnProgress = updateMatchesCountOnProgress;
                    this.onIsPageVisible = null;
                    this.#reset();
                    eventBus._on("find", this.#onFind.bind(this));
                    eventBus._on("findbarclose", this.#onFindBarClose.bind(this));
                }

                get highlightMatches() {
                    return this._highlightMatches;
                }

                get pageMatches() {
                    return this._pageMatches;
                }

                get pageMatchesLength() {
                    return this._pageMatchesLength;
                }

                get selected() {
                    return this._selected;
                }

                get state() {
                    return this.#state;
                }

                setDocument(pdfDocument) {
                    if (this._pdfDocument) {
                        this.#reset();
                    }
                    if (!pdfDocument) {
                        return;
                    }
                    this._pdfDocument = pdfDocument;
                    this._firstPageCapability.resolve();
                }

                #onFind(state) {
                    if (!state) {
                        return;
                    }
                    if (state.phraseSearch === false) {
                        console.error("The `phraseSearch`-parameter was removed, please provide " + "an Array of strings in the `query`-parameter instead.");
                        if (typeof state.query === "string") {
                            state.query = state.query.match(/\S+/g);
                        }
                    }
                    const pdfDocument = this._pdfDocument;
                    const {
                        type
                    } = state;
                    if (this.#state === null || this.#shouldDirtyMatch(state)) {
                        this._dirtyMatch = true;
                    }
                    this.#state = state;
                    if (type !== "highlightallchange") {
                        this.#updateUIState(FindState.PENDING);
                    }
                    this._firstPageCapability.promise.then(() => {
                        if (!this._pdfDocument || pdfDocument && this._pdfDocument !== pdfDocument) {
                            return;
                        }
                        this.#extractText();
                        const findbarClosed = !this._highlightMatches;
                        const pendingTimeout = !!this._findTimeout;
                        if (this._findTimeout) {
                            clearTimeout(this._findTimeout);
                            this._findTimeout = null;
                        }
                        if (!type) {
                            this._findTimeout = setTimeout(() => {
                                this.#nextMatch();
                                this._findTimeout = null;
                            }, FIND_TIMEOUT);
                        } else if (this._dirtyMatch) {
                            this.#nextMatch();
                        } else if (type === "again") {
                            this.#nextMatch();
                            if (findbarClosed && this.#state.highlightAll) {
                                this.#updateAllPages();
                            }
                        } else if (type === "highlightallchange") {
                            if (pendingTimeout) {
                                this.#nextMatch();
                            } else {
                                this._highlightMatches = true;
                            }
                            this.#updateAllPages();
                        } else {
                            this.#nextMatch();
                        }
                    });
                }

                scrollMatchIntoView({
                                        element = null,
                                        selectedLeft = 0,
                                        pageIndex = -1,
                                        matchIndex = -1
                                    }) {
                    if (!this._scrollMatches || !element) {
                        return;
                    } else if (matchIndex === -1 || matchIndex !== this._selected.matchIdx) {
                        return;
                    } else if (pageIndex === -1 || pageIndex !== this._selected.pageIdx) {
                        return;
                    }
                    this._scrollMatches = false;
                    const spot = {
                        top: MATCH_SCROLL_OFFSET_TOP,
                        left: selectedLeft + MATCH_SCROLL_OFFSET_LEFT
                    };
                    (0, _ui_utils.scrollIntoView)(element, spot, true);
                }

                #reset() {
                    this._highlightMatches = false;
                    this._scrollMatches = false;
                    this._pdfDocument = null;
                    this._pageMatches = [];
                    this._pageMatchesLength = [];
                    this.#visitedPagesCount = 0;
                    this.#state = null;
                    this._selected = {
                        pageIdx: -1,
                        matchIdx: -1
                    };
                    this._offset = {
                        pageIdx: null,
                        matchIdx: null,
                        wrapped: false
                    };
                    this._extractTextPromises = [];
                    this._pageContents = [];
                    this._pageDiffs = [];
                    this._hasDiacritics = [];
                    this._matchesCountTotal = 0;
                    this._pagesToSearch = null;
                    this._pendingFindMatches = new Set();
                    this._resumePageIdx = null;
                    this._dirtyMatch = false;
                    clearTimeout(this._findTimeout);
                    this._findTimeout = null;
                    this._firstPageCapability = new _pdfjsLib.PromiseCapability();
                }

                get #query() {
                    const {
                        query
                    } = this.#state;
                    if (typeof query === "string") {
                        if (query !== this._rawQuery) {
                            this._rawQuery = query;
                            [this._normalizedQuery] = normalize(query);
                        }
                        return this._normalizedQuery;
                    }
                    return (query || []).filter(q => !!q).map(q => normalize(q)[0]);
                }

                #shouldDirtyMatch(state) {
                    const newQuery = state.query,
                        prevQuery = this.#state.query;
                    const newType = typeof newQuery,
                        prevType = typeof prevQuery;
                    if (newType !== prevType) {
                        return true;
                    }
                    if (newType === "string") {
                        if (newQuery !== prevQuery) {
                            return true;
                        }
                    } else if (JSON.stringify(newQuery) !== JSON.stringify(prevQuery)) {
                        return true;
                    }
                    switch (state.type) {
                        case "again":
                            const pageNumber = this._selected.pageIdx + 1;
                            const linkService = this._linkService;
                            return pageNumber >= 1 && pageNumber <= linkService.pagesCount && pageNumber !== linkService.page && !(this.onIsPageVisible?.(pageNumber) ?? true);
                        case "highlightallchange":
                            return false;
                    }
                    return true;
                }

                #isEntireWord(content, startIdx, length) {
                    let match = content.slice(0, startIdx).match(NOT_DIACRITIC_FROM_END_REG_EXP);
                    if (match) {
                        const first = content.charCodeAt(startIdx);
                        const limit = match[1].charCodeAt(0);
                        if ((0, _pdf_find_utils.getCharacterType)(first) === (0, _pdf_find_utils.getCharacterType)(limit)) {
                            return false;
                        }
                    }
                    match = content.slice(startIdx + length).match(NOT_DIACRITIC_FROM_START_REG_EXP);
                    if (match) {
                        const last = content.charCodeAt(startIdx + length - 1);
                        const limit = match[1].charCodeAt(0);
                        if ((0, _pdf_find_utils.getCharacterType)(last) === (0, _pdf_find_utils.getCharacterType)(limit)) {
                            return false;
                        }
                    }
                    return true;
                }

                #calculateRegExpMatch(query, entireWord, pageIndex, pageContent) {
                    const matches = this._pageMatches[pageIndex] = [];
                    const matchesLength = this._pageMatchesLength[pageIndex] = [];
                    if (!query) {
                        return;
                    }
                    const diffs = this._pageDiffs[pageIndex];
                    let match;
                    while ((match = query.exec(pageContent)) !== null) {
                        if (entireWord && !this.#isEntireWord(pageContent, match.index, match[0].length)) {
                            continue;
                        }
                        const [matchPos, matchLen] = getOriginalIndex(diffs, match.index, match[0].length);
                        if (matchLen) {
                            matches.push(matchPos);
                            matchesLength.push(matchLen);
                        }
                    }
                }

                #convertToRegExpString(query, hasDiacritics) {
                    const {
                        matchDiacritics
                    } = this.#state;
                    let isUnicode = false;
                    query = query.replaceAll(SPECIAL_CHARS_REG_EXP, (match, p1, p2, p3, p4, p5) => {
                        if (p1) {
                            return `[ ]*\\${p1}[ ]*`;
                        }
                        if (p2) {
                            return `[ ]*${p2}[ ]*`;
                        }
                        if (p3) {
                            return "[ ]+";
                        }
                        if (matchDiacritics) {
                            return p4 || p5;
                        }
                        if (p4) {
                            return DIACRITICS_EXCEPTION.has(p4.charCodeAt(0)) ? p4 : "";
                        }
                        if (hasDiacritics) {
                            isUnicode = true;
                            return `${p5}\\p{M}*`;
                        }
                        return p5;
                    });
                    const trailingSpaces = "[ ]*";
                    if (query.endsWith(trailingSpaces)) {
                        query = query.slice(0, query.length - trailingSpaces.length);
                    }
                    if (matchDiacritics) {
                        if (hasDiacritics) {
                            DIACRITICS_EXCEPTION_STR ||= String.fromCharCode(...DIACRITICS_EXCEPTION);
                            isUnicode = true;
                            query = `${query}(?=[${DIACRITICS_EXCEPTION_STR}]|[^\\p{M}]|$)`;
                        }
                    }
                    return [isUnicode, query];
                }

                #calculateMatch(pageIndex) {
                    let query = this.#query;
                    if (query.length === 0) {
                        return;
                    }
                    const {
                        caseSensitive,
                        entireWord
                    } = this.#state;
                    const pageContent = this._pageContents[pageIndex];
                    const hasDiacritics = this._hasDiacritics[pageIndex];
                    let isUnicode = false;
                    if (typeof query === "string") {
                        [isUnicode, query] = this.#convertToRegExpString(query, hasDiacritics);
                    } else {
                        query = query.sort().reverse().map(q => {
                            const [isUnicodePart, queryPart] = this.#convertToRegExpString(q, hasDiacritics);
                            isUnicode ||= isUnicodePart;
                            return `(${queryPart})`;
                        }).join("|");
                    }
                    const flags = `g${isUnicode ? "u" : ""}${caseSensitive ? "" : "i"}`;
                    query = query ? new RegExp(query, flags) : null;
                    this.#calculateRegExpMatch(query, entireWord, pageIndex, pageContent);
                    if (this.#state.highlightAll) {
                        this.#updatePage(pageIndex);
                    }
                    if (this._resumePageIdx === pageIndex) {
                        this._resumePageIdx = null;
                        this.#nextPageMatch();
                    }
                    const pageMatchesCount = this._pageMatches[pageIndex].length;
                    this._matchesCountTotal += pageMatchesCount;
                    if (this.#updateMatchesCountOnProgress) {
                        if (pageMatchesCount > 0) {
                            this.#updateUIResultsCount();
                        }
                    } else if (++this.#visitedPagesCount === this._linkService.pagesCount) {
                        this.#updateUIResultsCount();
                    }
                }

                #extractText() {
                    if (this._extractTextPromises.length > 0) {
                        return;
                    }
                    let promise = Promise.resolve();
                    const textOptions = {
                        disableNormalization: true
                    };
                    for (let i = 0, ii = this._linkService.pagesCount; i < ii; i++) {
                        const extractTextCapability = new _pdfjsLib.PromiseCapability();
                        this._extractTextPromises[i] = extractTextCapability.promise;
                        promise = promise.then(() => {
                            return this._pdfDocument.getPage(i + 1).then(pdfPage => {
                                return pdfPage.getTextContent(textOptions);
                            }).then(textContent => {
                                const strBuf = [];
                                for (const textItem of textContent.items) {
                                    strBuf.push(textItem.str);
                                    if (textItem.hasEOL) {
                                        strBuf.push("\n");
                                    }
                                }
                                [this._pageContents[i], this._pageDiffs[i], this._hasDiacritics[i]] = normalize(strBuf.join(""));
                                extractTextCapability.resolve();
                            }, reason => {
                                console.error(`Unable to get text content for page ${i + 1}`, reason);
                                this._pageContents[i] = "";
                                this._pageDiffs[i] = null;
                                this._hasDiacritics[i] = false;
                                extractTextCapability.resolve();
                            });
                        });
                    }
                }

                #updatePage(index) {
                    if (this._scrollMatches && this._selected.pageIdx === index) {
                        this._linkService.page = index + 1;
                    }
                    this._eventBus.dispatch("updatetextlayermatches", {
                        source: this,
                        pageIndex: index
                    });
                }

                #updateAllPages() {
                    this._eventBus.dispatch("updatetextlayermatches", {
                        source: this,
                        pageIndex: -1
                    });
                }

                #nextMatch() {
                    const previous = this.#state.findPrevious;
                    const currentPageIndex = this._linkService.page - 1;
                    const numPages = this._linkService.pagesCount;
                    this._highlightMatches = true;
                    if (this._dirtyMatch) {
                        this._dirtyMatch = false;
                        this._selected.pageIdx = this._selected.matchIdx = -1;
                        this._offset.pageIdx = currentPageIndex;
                        this._offset.matchIdx = null;
                        this._offset.wrapped = false;
                        this._resumePageIdx = null;
                        this._pageMatches.length = 0;
                        this._pageMatchesLength.length = 0;
                        this.#visitedPagesCount = 0;
                        this._matchesCountTotal = 0;
                        this.#updateAllPages();
                        for (let i = 0; i < numPages; i++) {
                            if (this._pendingFindMatches.has(i)) {
                                continue;
                            }
                            this._pendingFindMatches.add(i);
                            this._extractTextPromises[i].then(() => {
                                this._pendingFindMatches.delete(i);
                                this.#calculateMatch(i);
                            });
                        }
                    }
                    const query = this.#query;
                    if (query.length === 0) {
                        this.#updateUIState(FindState.FOUND);
                        return;
                    }
                    if (this._resumePageIdx) {
                        return;
                    }
                    const offset = this._offset;
                    this._pagesToSearch = numPages;
                    if (offset.matchIdx !== null) {
                        const numPageMatches = this._pageMatches[offset.pageIdx].length;
                        if (!previous && offset.matchIdx + 1 < numPageMatches || previous && offset.matchIdx > 0) {
                            offset.matchIdx = previous ? offset.matchIdx - 1 : offset.matchIdx + 1;
                            this.#updateMatch(true);
                            return;
                        }
                        this.#advanceOffsetPage(previous);
                    }
                    this.#nextPageMatch();
                }

                #matchesReady(matches) {
                    const offset = this._offset;
                    const numMatches = matches.length;
                    const previous = this.#state.findPrevious;
                    if (numMatches) {
                        offset.matchIdx = previous ? numMatches - 1 : 0;
                        this.#updateMatch(true);
                        return true;
                    }
                    this.#advanceOffsetPage(previous);
                    if (offset.wrapped) {
                        offset.matchIdx = null;
                        if (this._pagesToSearch < 0) {
                            this.#updateMatch(false);
                            return true;
                        }
                    }
                    return false;
                }

                #nextPageMatch() {
                    if (this._resumePageIdx !== null) {
                        console.error("There can only be one pending page.");
                    }
                    let matches = null;
                    do {
                        const pageIdx = this._offset.pageIdx;
                        matches = this._pageMatches[pageIdx];
                        if (!matches) {
                            this._resumePageIdx = pageIdx;
                            break;
                        }
                    } while (!this.#matchesReady(matches));
                }

                #advanceOffsetPage(previous) {
                    const offset = this._offset;
                    const numPages = this._linkService.pagesCount;
                    offset.pageIdx = previous ? offset.pageIdx - 1 : offset.pageIdx + 1;
                    offset.matchIdx = null;
                    this._pagesToSearch--;
                    if (offset.pageIdx >= numPages || offset.pageIdx < 0) {
                        offset.pageIdx = previous ? numPages - 1 : 0;
                        offset.wrapped = true;
                    }
                }

                #updateMatch(found = false) {
                    let state = FindState.NOT_FOUND;
                    const wrapped = this._offset.wrapped;
                    this._offset.wrapped = false;
                    if (found) {
                        const previousPage = this._selected.pageIdx;
                        this._selected.pageIdx = this._offset.pageIdx;
                        this._selected.matchIdx = this._offset.matchIdx;
                        state = wrapped ? FindState.WRAPPED : FindState.FOUND;
                        if (previousPage !== -1 && previousPage !== this._selected.pageIdx) {
                            this.#updatePage(previousPage);
                        }
                    }
                    this.#updateUIState(state, this.#state.findPrevious);
                    if (this._selected.pageIdx !== -1) {
                        this._scrollMatches = true;
                        this.#updatePage(this._selected.pageIdx);
                    }
                }

                #onFindBarClose(evt) {
                    const pdfDocument = this._pdfDocument;
                    this._firstPageCapability.promise.then(() => {
                        if (!this._pdfDocument || pdfDocument && this._pdfDocument !== pdfDocument) {
                            return;
                        }
                        if (this._findTimeout) {
                            clearTimeout(this._findTimeout);
                            this._findTimeout = null;
                        }
                        if (this._resumePageIdx) {
                            this._resumePageIdx = null;
                            this._dirtyMatch = true;
                        }
                        this.#updateUIState(FindState.FOUND);
                        this._highlightMatches = false;
                        this.#updateAllPages();
                    });
                }

                #requestMatchesCount() {
                    const {
                        pageIdx,
                        matchIdx
                    } = this._selected;
                    let current = 0,
                        total = this._matchesCountTotal;
                    if (matchIdx !== -1) {
                        for (let i = 0; i < pageIdx; i++) {
                            current += this._pageMatches[i]?.length || 0;
                        }
                        current += matchIdx + 1;
                    }
                    if (current < 1 || current > total) {
                        current = total = 0;
                    }
                    return {
                        current,
                        total
                    };
                }

                #updateUIResultsCount() {
                    this._eventBus.dispatch("updatefindmatchescount", {
                        source: this,
                        matchesCount: this.#requestMatchesCount()
                    });
                }

                #updateUIState(state, previous = false) {
                    if (!this.#updateMatchesCountOnProgress && (this.#visitedPagesCount !== this._linkService.pagesCount || state === FindState.PENDING)) {
                        return;
                    }
                    this._eventBus.dispatch("updatefindcontrolstate", {
                        source: this,
                        state,
                        previous,
                        matchesCount: this.#requestMatchesCount(),
                        rawQuery: this.#state?.query ?? null
                    });
                }
            }

            exports.PDFFindController = PDFFindController;

            /***/
        }),
        /* 19 */
        /***/ ((__unused_webpack_module, exports) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.CharacterType = void 0;
            exports.getCharacterType = getCharacterType;
            exports.getNormalizeWithNFKC = getNormalizeWithNFKC;
            const CharacterType = {
                SPACE: 0,
                ALPHA_LETTER: 1,
                PUNCT: 2,
                HAN_LETTER: 3,
                KATAKANA_LETTER: 4,
                HIRAGANA_LETTER: 5,
                HALFWIDTH_KATAKANA_LETTER: 6,
                THAI_LETTER: 7
            };
            exports.CharacterType = CharacterType;

            function isAlphabeticalScript(charCode) {
                return charCode < 0x2e80;
            }

            function isAscii(charCode) {
                return (charCode & 0xff80) === 0;
            }

            function isAsciiAlpha(charCode) {
                return charCode >= 0x61 && charCode <= 0x7a || charCode >= 0x41 && charCode <= 0x5a;
            }

            function isAsciiDigit(charCode) {
                return charCode >= 0x30 && charCode <= 0x39;
            }

            function isAsciiSpace(charCode) {
                return charCode === 0x20 || charCode === 0x09 || charCode === 0x0d || charCode === 0x0a;
            }

            function isHan(charCode) {
                return charCode >= 0x3400 && charCode <= 0x9fff || charCode >= 0xf900 && charCode <= 0xfaff;
            }

            function isKatakana(charCode) {
                return charCode >= 0x30a0 && charCode <= 0x30ff;
            }

            function isHiragana(charCode) {
                return charCode >= 0x3040 && charCode <= 0x309f;
            }

            function isHalfwidthKatakana(charCode) {
                return charCode >= 0xff60 && charCode <= 0xff9f;
            }

            function isThai(charCode) {
                return (charCode & 0xff80) === 0x0e00;
            }

            function getCharacterType(charCode) {
                if (isAlphabeticalScript(charCode)) {
                    if (isAscii(charCode)) {
                        if (isAsciiSpace(charCode)) {
                            return CharacterType.SPACE;
                        } else if (isAsciiAlpha(charCode) || isAsciiDigit(charCode) || charCode === 0x5f) {
                            return CharacterType.ALPHA_LETTER;
                        }
                        return CharacterType.PUNCT;
                    } else if (isThai(charCode)) {
                        return CharacterType.THAI_LETTER;
                    } else if (charCode === 0xa0) {
                        return CharacterType.SPACE;
                    }
                    return CharacterType.ALPHA_LETTER;
                }
                if (isHan(charCode)) {
                    return CharacterType.HAN_LETTER;
                } else if (isKatakana(charCode)) {
                    return CharacterType.KATAKANA_LETTER;
                } else if (isHiragana(charCode)) {
                    return CharacterType.HIRAGANA_LETTER;
                } else if (isHalfwidthKatakana(charCode)) {
                    return CharacterType.HALFWIDTH_KATAKANA_LETTER;
                }
                return CharacterType.ALPHA_LETTER;
            }

            let NormalizeWithNFKC;

            function getNormalizeWithNFKC() {
                NormalizeWithNFKC ||= ` ¨ª¯²-µ¸-º¼-¾Ĳ-ĳĿ-ŀŉſǄ-ǌǱ-ǳʰ-ʸ˘-˝ˠ-ˤʹͺ;΄-΅·ϐ-ϖϰ-ϲϴ-ϵϹևٵ-ٸक़-य़ড়-ঢ়য়ਲ਼ਸ਼ਖ਼-ਜ਼ਫ਼ଡ଼-ଢ଼ำຳໜ-ໝ༌གྷཌྷདྷབྷཛྷཀྵჼᴬ-ᴮᴰ-ᴺᴼ-ᵍᵏ-ᵪᵸᶛ-ᶿẚ-ẛάέήίόύώΆ᾽-῁ΈΉ῍-῏ΐΊ῝-῟ΰΎ῭-`ΌΏ´-῾ - ‑‗․-… ″-‴‶-‷‼‾⁇-⁉⁗ ⁰-ⁱ⁴-₎ₐ-ₜ₨℀-℃℅-ℇ℉-ℓℕ-№ℙ-ℝ℠-™ℤΩℨK-ℭℯ-ℱℳ-ℹ℻-⅀ⅅ-ⅉ⅐-ⅿ↉∬-∭∯-∰〈-〉①-⓪⨌⩴-⩶⫝̸ⱼ-ⱽⵯ⺟⻳⼀-⿕　〶〸-〺゛-゜ゟヿㄱ-ㆎ㆒-㆟㈀-㈞㈠-㉇㉐-㉾㊀-㏿ꚜ-ꚝꝰꟲ-ꟴꟸ-ꟹꭜ-ꭟꭩ豈-嗀塚晴凞-羽蘒諸逸-都飯-舘並-龎ﬀ-ﬆﬓ-ﬗיִײַ-זּטּ-לּמּנּ-סּףּ-פּצּ-ﮱﯓ-ﴽﵐ-ﶏﶒ-ﷇﷰ-﷼︐-︙︰-﹄﹇-﹒﹔-﹦﹨-﹫ﹰ-ﹲﹴﹶ-ﻼ！-ﾾￂ-ￇￊ-ￏￒ-ￗￚ-ￜ￠-￦`;
                return NormalizeWithNFKC;
            }

            /***/
        }),
        /* 20 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PDFHistory = void 0;
            exports.isDestArraysEqual = isDestArraysEqual;
            exports.isDestHashesEqual = isDestHashesEqual;
            var _ui_utils = __webpack_require__(3);
            var _event_utils = __webpack_require__(6);
            const HASH_CHANGE_TIMEOUT = 1000;
            const POSITION_UPDATED_THRESHOLD = 50;
            const UPDATE_VIEWAREA_TIMEOUT = 1000;

            function getCurrentHash() {
                return document.location.hash;
            }

            class PDFHistory {
                constructor({
                                linkService,
                                eventBus
                            }) {
                    this.linkService = linkService;
                    this.eventBus = eventBus;
                    this._initialized = false;
                    this._fingerprint = "";
                    this.reset();
                    this._boundEvents = null;
                    this.eventBus._on("pagesinit", () => {
                        this._isPagesLoaded = false;
                        this.eventBus._on("pagesloaded", evt => {
                            this._isPagesLoaded = !!evt.pagesCount;
                        }, {
                            once: true
                        });
                    });
                }

                initialize({
                               fingerprint,
                               resetHistory = false,
                               updateUrl = false
                           }) {
                    if (!fingerprint || typeof fingerprint !== "string") {
                        console.error('PDFHistory.initialize: The "fingerprint" must be a non-empty string.');
                        return;
                    }
                    if (this._initialized) {
                        this.reset();
                    }
                    const reInitialized = this._fingerprint !== "" && this._fingerprint !== fingerprint;
                    this._fingerprint = fingerprint;
                    this._updateUrl = updateUrl === true;
                    this._initialized = true;
                    this._bindEvents();
                    const state = window.history.state;
                    this._popStateInProgress = false;
                    this._blockHashChange = 0;
                    this._currentHash = getCurrentHash();
                    this._numPositionUpdates = 0;
                    this._uid = this._maxUid = 0;
                    this._destination = null;
                    this._position = null;
                    if (!this._isValidState(state, true) || resetHistory) {
                        const {
                            hash,
                            page,
                            rotation
                        } = this._parseCurrentHash(true);
                        if (!hash || reInitialized || resetHistory) {
                            this._pushOrReplaceState(null, true);
                            return;
                        }
                        this._pushOrReplaceState({
                            hash,
                            page,
                            rotation
                        }, true);
                        return;
                    }
                    const destination = state.destination;
                    this._updateInternalState(destination, state.uid, true);
                    if (destination.rotation !== undefined) {
                        this._initialRotation = destination.rotation;
                    }
                    if (destination.dest) {
                        this._initialBookmark = JSON.stringify(destination.dest);
                        this._destination.page = null;
                    } else if (destination.hash) {
                        this._initialBookmark = destination.hash;
                    } else if (destination.page) {
                        this._initialBookmark = `page=${destination.page}`;
                    }
                }

                reset() {
                    if (this._initialized) {
                        this._pageHide();
                        this._initialized = false;
                        this._unbindEvents();
                    }
                    if (this._updateViewareaTimeout) {
                        clearTimeout(this._updateViewareaTimeout);
                        this._updateViewareaTimeout = null;
                    }
                    this._initialBookmark = null;
                    this._initialRotation = null;
                }

                push({
                         namedDest = null,
                         explicitDest,
                         pageNumber
                     }) {
                    if (!this._initialized) {
                        return;
                    }
                    if (namedDest && typeof namedDest !== "string") {
                        console.error("PDFHistory.push: " + `"${namedDest}" is not a valid namedDest parameter.`);
                        return;
                    } else if (!Array.isArray(explicitDest)) {
                        console.error("PDFHistory.push: " + `"${explicitDest}" is not a valid explicitDest parameter.`);
                        return;
                    } else if (!this._isValidPage(pageNumber)) {
                        if (pageNumber !== null || this._destination) {
                            console.error("PDFHistory.push: " + `"${pageNumber}" is not a valid pageNumber parameter.`);
                            return;
                        }
                    }
                    const hash = namedDest || JSON.stringify(explicitDest);
                    if (!hash) {
                        return;
                    }
                    let forceReplace = false;
                    if (this._destination && (isDestHashesEqual(this._destination.hash, hash) || isDestArraysEqual(this._destination.dest, explicitDest))) {
                        if (this._destination.page) {
                            return;
                        }
                        forceReplace = true;
                    }
                    if (this._popStateInProgress && !forceReplace) {
                        return;
                    }
                    this._pushOrReplaceState({
                        dest: explicitDest,
                        hash,
                        page: pageNumber,
                        rotation: this.linkService.rotation
                    }, forceReplace);
                    if (!this._popStateInProgress) {
                        this._popStateInProgress = true;
                        Promise.resolve().then(() => {
                            this._popStateInProgress = false;
                        });
                    }
                }

                pushPage(pageNumber) {
                    if (!this._initialized) {
                        return;
                    }
                    if (!this._isValidPage(pageNumber)) {
                        console.error(`PDFHistory.pushPage: "${pageNumber}" is not a valid page number.`);
                        return;
                    }
                    if (this._destination?.page === pageNumber) {
                        return;
                    }
                    if (this._popStateInProgress) {
                        return;
                    }
                    this._pushOrReplaceState({
                        dest: null,
                        hash: `page=${pageNumber}`,
                        page: pageNumber,
                        rotation: this.linkService.rotation
                    });
                    if (!this._popStateInProgress) {
                        this._popStateInProgress = true;
                        Promise.resolve().then(() => {
                            this._popStateInProgress = false;
                        });
                    }
                }

                pushCurrentPosition() {
                    if (!this._initialized || this._popStateInProgress) {
                        return;
                    }
                    this._tryPushCurrentPosition();
                }

                back() {
                    if (!this._initialized || this._popStateInProgress) {
                        return;
                    }
                    const state = window.history.state;
                    if (this._isValidState(state) && state.uid > 0) {
                        window.history.back();
                    }
                }

                forward() {
                    if (!this._initialized || this._popStateInProgress) {
                        return;
                    }
                    const state = window.history.state;
                    if (this._isValidState(state) && state.uid < this._maxUid) {
                        window.history.forward();
                    }
                }

                get popStateInProgress() {
                    return this._initialized && (this._popStateInProgress || this._blockHashChange > 0);
                }

                get initialBookmark() {
                    return this._initialized ? this._initialBookmark : null;
                }

                get initialRotation() {
                    return this._initialized ? this._initialRotation : null;
                }

                _pushOrReplaceState(destination, forceReplace = false) {
                    const shouldReplace = forceReplace || !this._destination;
                    const newState = {
                        fingerprint: this._fingerprint,
                        uid: shouldReplace ? this._uid : this._uid + 1,
                        destination
                    };
                    this._updateInternalState(destination, newState.uid);
                    let newUrl;
                    if (this._updateUrl && destination?.hash) {
                        const baseUrl = document.location.href.split("#")[0];
                        if (!baseUrl.startsWith("file://")) {
                            newUrl = `${baseUrl}#${destination.hash}`;
                        }
                    }
                    if (shouldReplace) {
                        window.history.replaceState(newState, "", newUrl);
                    } else {
                        window.history.pushState(newState, "", newUrl);
                    }
                }

                _tryPushCurrentPosition(temporary = false) {
                    if (!this._position) {
                        return;
                    }
                    let position = this._position;
                    if (temporary) {
                        position = Object.assign(Object.create(null), this._position);
                        position.temporary = true;
                    }
                    if (!this._destination) {
                        this._pushOrReplaceState(position);
                        return;
                    }
                    if (this._destination.temporary) {
                        this._pushOrReplaceState(position, true);
                        return;
                    }
                    if (this._destination.hash === position.hash) {
                        return;
                    }
                    if (!this._destination.page && (POSITION_UPDATED_THRESHOLD <= 0 || this._numPositionUpdates <= POSITION_UPDATED_THRESHOLD)) {
                        return;
                    }
                    let forceReplace = false;
                    if (this._destination.page >= position.first && this._destination.page <= position.page) {
                        if (this._destination.dest !== undefined || !this._destination.first) {
                            return;
                        }
                        forceReplace = true;
                    }
                    this._pushOrReplaceState(position, forceReplace);
                }

                _isValidPage(val) {
                    return Number.isInteger(val) && val > 0 && val <= this.linkService.pagesCount;
                }

                _isValidState(state, checkReload = false) {
                    if (!state) {
                        return false;
                    }
                    if (state.fingerprint !== this._fingerprint) {
                        if (checkReload) {
                            if (typeof state.fingerprint !== "string" || state.fingerprint.length !== this._fingerprint.length) {
                                return false;
                            }
                            const [perfEntry] = performance.getEntriesByType("navigation");
                            if (perfEntry?.type !== "reload") {
                                return false;
                            }
                        } else {
                            return false;
                        }
                    }
                    if (!Number.isInteger(state.uid) || state.uid < 0) {
                        return false;
                    }
                    if (state.destination === null || typeof state.destination !== "object") {
                        return false;
                    }
                    return true;
                }

                _updateInternalState(destination, uid, removeTemporary = false) {
                    if (this._updateViewareaTimeout) {
                        clearTimeout(this._updateViewareaTimeout);
                        this._updateViewareaTimeout = null;
                    }
                    if (removeTemporary && destination?.temporary) {
                        delete destination.temporary;
                    }
                    this._destination = destination;
                    this._uid = uid;
                    this._maxUid = Math.max(this._maxUid, uid);
                    this._numPositionUpdates = 0;
                }

                _parseCurrentHash(checkNameddest = false) {
                    const hash = unescape(getCurrentHash()).substring(1);
                    const params = (0, _ui_utils.parseQueryString)(hash);
                    const nameddest = params.get("nameddest") || "";
                    let page = params.get("page") | 0;
                    if (!this._isValidPage(page) || checkNameddest && nameddest.length > 0) {
                        page = null;
                    }
                    return {
                        hash,
                        page,
                        rotation: this.linkService.rotation
                    };
                }

                _updateViewarea({
                                    location
                                }) {
                    if (this._updateViewareaTimeout) {
                        clearTimeout(this._updateViewareaTimeout);
                        this._updateViewareaTimeout = null;
                    }
                    this._position = {
                        hash: location.pdfOpenParams.substring(1),
                        page: this.linkService.page,
                        first: location.pageNumber,
                        rotation: location.rotation
                    };
                    if (this._popStateInProgress) {
                        return;
                    }
                    if (POSITION_UPDATED_THRESHOLD > 0 && this._isPagesLoaded && this._destination && !this._destination.page) {
                        this._numPositionUpdates++;
                    }
                    if (UPDATE_VIEWAREA_TIMEOUT > 0) {
                        this._updateViewareaTimeout = setTimeout(() => {
                            if (!this._popStateInProgress) {
                                this._tryPushCurrentPosition(true);
                            }
                            this._updateViewareaTimeout = null;
                        }, UPDATE_VIEWAREA_TIMEOUT);
                    }
                }

                _popState({
                              state
                          }) {
                    const newHash = getCurrentHash(),
                        hashChanged = this._currentHash !== newHash;
                    this._currentHash = newHash;
                    if (!state) {
                        this._uid++;
                        const {
                            hash,
                            page,
                            rotation
                        } = this._parseCurrentHash();
                        this._pushOrReplaceState({
                            hash,
                            page,
                            rotation
                        }, true);
                        return;
                    }
                    if (!this._isValidState(state)) {
                        return;
                    }
                    this._popStateInProgress = true;
                    if (hashChanged) {
                        this._blockHashChange++;
                        (0, _event_utils.waitOnEventOrTimeout)({
                            target: window,
                            name: "hashchange",
                            delay: HASH_CHANGE_TIMEOUT
                        }).then(() => {
                            this._blockHashChange--;
                        });
                    }
                    const destination = state.destination;
                    this._updateInternalState(destination, state.uid, true);
                    if ((0, _ui_utils.isValidRotation)(destination.rotation)) {
                        this.linkService.rotation = destination.rotation;
                    }
                    if (destination.dest) {
                        this.linkService.goToDestination(destination.dest);
                    } else if (destination.hash) {
                        this.linkService.setHash(destination.hash);
                    } else if (destination.page) {
                        this.linkService.page = destination.page;
                    }
                    Promise.resolve().then(() => {
                        this._popStateInProgress = false;
                    });
                }

                _pageHide() {
                    if (!this._destination || this._destination.temporary) {
                        this._tryPushCurrentPosition();
                    }
                }

                _bindEvents() {
                    if (this._boundEvents) {
                        return;
                    }
                    this._boundEvents = {
                        updateViewarea: this._updateViewarea.bind(this),
                        popState: this._popState.bind(this),
                        pageHide: this._pageHide.bind(this)
                    };
                    this.eventBus._on("updateviewarea", this._boundEvents.updateViewarea);
                    window.addEventListener("popstate", this._boundEvents.popState);
                    window.addEventListener("pagehide", this._boundEvents.pageHide);
                }

                _unbindEvents() {
                    if (!this._boundEvents) {
                        return;
                    }
                    this.eventBus._off("updateviewarea", this._boundEvents.updateViewarea);
                    window.removeEventListener("popstate", this._boundEvents.popState);
                    window.removeEventListener("pagehide", this._boundEvents.pageHide);
                    this._boundEvents = null;
                }
            }

            exports.PDFHistory = PDFHistory;

            function isDestHashesEqual(destHash, pushHash) {
                if (typeof destHash !== "string" || typeof pushHash !== "string") {
                    return false;
                }
                if (destHash === pushHash) {
                    return true;
                }
                const nameddest = (0, _ui_utils.parseQueryString)(destHash).get("nameddest");
                if (nameddest === pushHash) {
                    return true;
                }
                return false;
            }

            function isDestArraysEqual(firstDest, secondDest) {
                function isEntryEqual(first, second) {
                    if (typeof first !== typeof second) {
                        return false;
                    }
                    if (Array.isArray(first) || Array.isArray(second)) {
                        return false;
                    }
                    if (first !== null && typeof first === "object" && second !== null) {
                        if (Object.keys(first).length !== Object.keys(second).length) {
                            return false;
                        }
                        for (const key in first) {
                            if (!isEntryEqual(first[key], second[key])) {
                                return false;
                            }
                        }
                        return true;
                    }
                    return first === second || Number.isNaN(first) && Number.isNaN(second);
                }

                if (!(Array.isArray(firstDest) && Array.isArray(secondDest))) {
                    return false;
                }
                if (firstDest.length !== secondDest.length) {
                    return false;
                }
                for (let i = 0, ii = firstDest.length; i < ii; i++) {
                    if (!isEntryEqual(firstDest[i], secondDest[i])) {
                        return false;
                    }
                }
                return true;
            }

            /***/
        }),
        /* 21 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PDFLayerViewer = void 0;
            var _base_tree_viewer = __webpack_require__(13);

            class PDFLayerViewer extends _base_tree_viewer.BaseTreeViewer {
                constructor(options) {
                    super(options);
                    this.l10n = options.l10n;
                    this.eventBus._on("optionalcontentconfigchanged", evt => {
                        this.#updateLayers(evt.promise);
                    });
                    this.eventBus._on("resetlayers", () => {
                        this.#updateLayers();
                    });
                    this.eventBus._on("togglelayerstree", this._toggleAllTreeItems.bind(this));
                }

                reset() {
                    super.reset();
                    this._optionalContentConfig = null;
                    this._optionalContentHash = null;
                }

                _dispatchEvent(layersCount) {
                    this.eventBus.dispatch("layersloaded", {
                        source: this,
                        layersCount
                    });
                }

                _bindLink(element, {
                    groupId,
                    input
                }) {
                    const setVisibility = () => {
                        this._optionalContentConfig.setVisibility(groupId, input.checked);
                        this._optionalContentHash = this._optionalContentConfig.getHash();
                        this.eventBus.dispatch("optionalcontentconfig", {
                            source: this,
                            promise: Promise.resolve(this._optionalContentConfig)
                        });
                    };
                    element.onclick = evt => {
                        if (evt.target === input) {
                            setVisibility();
                            return true;
                        } else if (evt.target !== element) {
                            return true;
                        }
                        input.checked = !input.checked;
                        setVisibility();
                        return false;
                    };
                }

                async _setNestedName(element, {
                    name = null
                }) {
                    if (typeof name === "string") {
                        element.textContent = this._normalizeTextContent(name);
                        return;
                    }
                    element.textContent = await this.l10n.get("additional_layers");
                    element.style.fontStyle = "italic";
                }

                _addToggleButton(div, {
                    name = null
                }) {
                    super._addToggleButton(div, name === null);
                }

                _toggleAllTreeItems() {
                    if (!this._optionalContentConfig) {
                        return;
                    }
                    super._toggleAllTreeItems();
                }

                render({
                           optionalContentConfig,
                           pdfDocument
                       }) {
                    if (this._optionalContentConfig) {
                        this.reset();
                    }
                    this._optionalContentConfig = optionalContentConfig || null;
                    this._pdfDocument = pdfDocument || null;
                    const groups = optionalContentConfig?.getOrder();
                    if (!groups) {
                        this._dispatchEvent(0);
                        return;
                    }
                    this._optionalContentHash = optionalContentConfig.getHash();
                    const fragment = document.createDocumentFragment(),
                        queue = [{
                            parent: fragment,
                            groups
                        }];
                    let layersCount = 0,
                        hasAnyNesting = false;
                    while (queue.length > 0) {
                        const levelData = queue.shift();
                        for (const groupId of levelData.groups) {
                            const div = document.createElement("div");
                            div.className = "treeItem";
                            const element = document.createElement("a");
                            div.append(element);
                            if (typeof groupId === "object") {
                                hasAnyNesting = true;
                                this._addToggleButton(div, groupId);
                                this._setNestedName(element, groupId);
                                const itemsDiv = document.createElement("div");
                                itemsDiv.className = "treeItems";
                                div.append(itemsDiv);
                                queue.push({
                                    parent: itemsDiv,
                                    groups: groupId.order
                                });
                            } else {
                                const group = optionalContentConfig.getGroup(groupId);
                                const input = document.createElement("input");
                                this._bindLink(element, {
                                    groupId,
                                    input
                                });
                                input.type = "checkbox";
                                input.checked = group.visible;
                                const label = document.createElement("label");
                                label.textContent = this._normalizeTextContent(group.name);
                                label.append(input);
                                element.append(label);
                                layersCount++;
                            }
                            levelData.parent.append(div);
                        }
                    }
                    this._finishRendering(fragment, layersCount, hasAnyNesting);
                }

                async #updateLayers(promise = null) {
                    if (!this._optionalContentConfig) {
                        return;
                    }
                    const pdfDocument = this._pdfDocument;
                    const optionalContentConfig = await (promise || pdfDocument.getOptionalContentConfig());
                    if (pdfDocument !== this._pdfDocument) {
                        return;
                    }
                    if (promise) {
                        if (optionalContentConfig.getHash() === this._optionalContentHash) {
                            return;
                        }
                    } else {
                        this.eventBus.dispatch("optionalcontentconfig", {
                            source: this,
                            promise: Promise.resolve(optionalContentConfig)
                        });
                    }
                    this.render({
                        optionalContentConfig,
                        pdfDocument: this._pdfDocument
                    });
                }
            }

            exports.PDFLayerViewer = PDFLayerViewer;

            /***/
        }),
        /* 22 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PDFOutlineViewer = void 0;
            var _base_tree_viewer = __webpack_require__(13);
            var _pdfjsLib = __webpack_require__(4);
            var _ui_utils = __webpack_require__(3);

            class PDFOutlineViewer extends _base_tree_viewer.BaseTreeViewer {
                constructor(options) {
                    super(options);
                    this.linkService = options.linkService;
                    this.downloadManager = options.downloadManager;
                    this.eventBus._on("toggleoutlinetree", this._toggleAllTreeItems.bind(this));
                    this.eventBus._on("currentoutlineitem", this._currentOutlineItem.bind(this));
                    this.eventBus._on("pagechanging", evt => {
                        this._currentPageNumber = evt.pageNumber;
                    });
                    this.eventBus._on("pagesloaded", evt => {
                        this._isPagesLoaded = !!evt.pagesCount;
                        if (this._currentOutlineItemCapability && !this._currentOutlineItemCapability.settled) {
                            this._currentOutlineItemCapability.resolve(this._isPagesLoaded);
                        }
                    });
                    this.eventBus._on("sidebarviewchanged", evt => {
                        this._sidebarView = evt.view;
                    });
                }

                reset() {
                    super.reset();
                    this._outline = null;
                    this._pageNumberToDestHashCapability = null;
                    this._currentPageNumber = 1;
                    this._isPagesLoaded = null;
                    if (this._currentOutlineItemCapability && !this._currentOutlineItemCapability.settled) {
                        this._currentOutlineItemCapability.resolve(false);
                    }
                    this._currentOutlineItemCapability = null;
                }

                _dispatchEvent(outlineCount) {
                    this._currentOutlineItemCapability = new _pdfjsLib.PromiseCapability();
                    if (outlineCount === 0 || this._pdfDocument?.loadingParams.disableAutoFetch) {
                        this._currentOutlineItemCapability.resolve(false);
                    } else if (this._isPagesLoaded !== null) {
                        this._currentOutlineItemCapability.resolve(this._isPagesLoaded);
                    }
                    this.eventBus.dispatch("outlineloaded", {
                        source: this,
                        outlineCount,
                        currentOutlineItemPromise: this._currentOutlineItemCapability.promise
                    });
                }

                _bindLink(element, {
                    url,
                    newWindow,
                    action,
                    attachment,
                    dest,
                    setOCGState
                }) {
                    const {
                        linkService
                    } = this;
                    if (url) {
                        linkService.addLinkAttributes(element, url, newWindow);
                        return;
                    }
                    if (action) {
                        element.href = linkService.getAnchorUrl("");
                        element.onclick = () => {
                            linkService.executeNamedAction(action);
                            return false;
                        };
                        return;
                    }
                    if (attachment) {
                        element.href = linkService.getAnchorUrl("");
                        element.onclick = () => {
                            this.downloadManager.openOrDownloadData(element, attachment.content, attachment.filename);
                            return false;
                        };
                        return;
                    }
                    if (setOCGState) {
                        element.href = linkService.getAnchorUrl("");
                        element.onclick = () => {
                            linkService.executeSetOCGState(setOCGState);
                            return false;
                        };
                        return;
                    }
                    element.href = linkService.getDestinationHash(dest);
                    element.onclick = evt => {
                        this._updateCurrentTreeItem(evt.target.parentNode);
                        if (dest) {
                            linkService.goToDestination(dest);
                        }
                        return false;
                    };
                }

                _setStyles(element, {
                    bold,
                    italic
                }) {
                    if (bold) {
                        element.style.fontWeight = "bold";
                    }
                    if (italic) {
                        element.style.fontStyle = "italic";
                    }
                }

                _addToggleButton(div, {
                    count,
                    items
                }) {
                    let hidden = false;
                    if (count < 0) {
                        let totalCount = items.length;
                        if (totalCount > 0) {
                            const queue = [...items];
                            while (queue.length > 0) {
                                const {
                                    count: nestedCount,
                                    items: nestedItems
                                } = queue.shift();
                                if (nestedCount > 0 && nestedItems.length > 0) {
                                    totalCount += nestedItems.length;
                                    queue.push(...nestedItems);
                                }
                            }
                        }
                        if (Math.abs(count) === totalCount) {
                            hidden = true;
                        }
                    }
                    super._addToggleButton(div, hidden);
                }

                _toggleAllTreeItems() {
                    if (!this._outline) {
                        return;
                    }
                    super._toggleAllTreeItems();
                }

                render({
                           outline,
                           pdfDocument
                       }) {
                    if (this._outline) {
                        this.reset();
                    }
                    this._outline = outline || null;
                    this._pdfDocument = pdfDocument || null;
                    if (!outline) {
                        this._dispatchEvent(0);
                        return;
                    }
                    const fragment = document.createDocumentFragment();
                    const queue = [{
                        parent: fragment,
                        items: outline
                    }];
                    let outlineCount = 0,
                        hasAnyNesting = false;
                    while (queue.length > 0) {
                        const levelData = queue.shift();
                        for (const item of levelData.items) {
                            const div = document.createElement("div");
                            div.className = "treeItem";
                            const element = document.createElement("a");
                            this._bindLink(element, item);
                            this._setStyles(element, item);
                            element.textContent = this._normalizeTextContent(item.title);
                            div.append(element);
                            if (item.items.length > 0) {
                                hasAnyNesting = true;
                                this._addToggleButton(div, item);
                                const itemsDiv = document.createElement("div");
                                itemsDiv.className = "treeItems";
                                div.append(itemsDiv);
                                queue.push({
                                    parent: itemsDiv,
                                    items: item.items
                                });
                            }
                            levelData.parent.append(div);
                            outlineCount++;
                        }
                    }
                    this._finishRendering(fragment, outlineCount, hasAnyNesting);
                }

                async _currentOutlineItem() {
                    if (!this._isPagesLoaded) {
                        throw new Error("_currentOutlineItem: All pages have not been loaded.");
                    }
                    if (!this._outline || !this._pdfDocument) {
                        return;
                    }
                    const pageNumberToDestHash = await this._getPageNumberToDestHash(this._pdfDocument);
                    if (!pageNumberToDestHash) {
                        return;
                    }
                    this._updateCurrentTreeItem(null);
                    if (this._sidebarView !== _ui_utils.SidebarView.OUTLINE) {
                        return;
                    }
                    for (let i = this._currentPageNumber; i > 0; i--) {
                        const destHash = pageNumberToDestHash.get(i);
                        if (!destHash) {
                            continue;
                        }
                        const linkElement = this.container.querySelector(`a[href="${destHash}"]`);
                        if (!linkElement) {
                            continue;
                        }
                        this._scrollToCurrentTreeItem(linkElement.parentNode);
                        break;
                    }
                }

                async _getPageNumberToDestHash(pdfDocument) {
                    if (this._pageNumberToDestHashCapability) {
                        return this._pageNumberToDestHashCapability.promise;
                    }
                    this._pageNumberToDestHashCapability = new _pdfjsLib.PromiseCapability();
                    const pageNumberToDestHash = new Map(),
                        pageNumberNesting = new Map();
                    const queue = [{
                        nesting: 0,
                        items: this._outline
                    }];
                    while (queue.length > 0) {
                        const levelData = queue.shift(),
                            currentNesting = levelData.nesting;
                        for (const {
                            dest,
                            items
                        } of levelData.items) {
                            let explicitDest, pageNumber;
                            if (typeof dest === "string") {
                                explicitDest = await pdfDocument.getDestination(dest);
                                if (pdfDocument !== this._pdfDocument) {
                                    return null;
                                }
                            } else {
                                explicitDest = dest;
                            }
                            if (Array.isArray(explicitDest)) {
                                const [destRef] = explicitDest;
                                if (typeof destRef === "object" && destRef !== null) {
                                    pageNumber = this.linkService._cachedPageNumber(destRef);
                                    if (!pageNumber) {
                                        try {
                                            pageNumber = (await pdfDocument.getPageIndex(destRef)) + 1;
                                            if (pdfDocument !== this._pdfDocument) {
                                                return null;
                                            }
                                            this.linkService.cachePageRef(pageNumber, destRef);
                                        } catch {
                                        }
                                    }
                                } else if (Number.isInteger(destRef)) {
                                    pageNumber = destRef + 1;
                                }
                                if (Number.isInteger(pageNumber) && (!pageNumberToDestHash.has(pageNumber) || currentNesting > pageNumberNesting.get(pageNumber))) {
                                    const destHash = this.linkService.getDestinationHash(dest);
                                    pageNumberToDestHash.set(pageNumber, destHash);
                                    pageNumberNesting.set(pageNumber, currentNesting);
                                }
                            }
                            if (items.length > 0) {
                                queue.push({
                                    nesting: currentNesting + 1,
                                    items
                                });
                            }
                        }
                    }
                    this._pageNumberToDestHashCapability.resolve(pageNumberToDestHash.size > 0 ? pageNumberToDestHash : null);
                    return this._pageNumberToDestHashCapability.promise;
                }
            }

            exports.PDFOutlineViewer = PDFOutlineViewer;

            /***/
        }),
        /* 23 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PDFPresentationMode = void 0;
            var _ui_utils = __webpack_require__(3);
            var _pdfjsLib = __webpack_require__(4);
            const DELAY_BEFORE_HIDING_CONTROLS = 3000;
            const ACTIVE_SELECTOR = "pdfPresentationMode";
            const CONTROLS_SELECTOR = "pdfPresentationModeControls";
            const MOUSE_SCROLL_COOLDOWN_TIME = 50;
            const PAGE_SWITCH_THRESHOLD = 0.1;
            const SWIPE_MIN_DISTANCE_THRESHOLD = 50;
            const SWIPE_ANGLE_THRESHOLD = Math.PI / 6;

            class PDFPresentationMode {
                #state = _ui_utils.PresentationModeState.UNKNOWN;
                #args = null;

                constructor({
                                container,
                                pdfViewer,
                                eventBus
                            }) {
                    this.container = container;
                    this.pdfViewer = pdfViewer;
                    this.eventBus = eventBus;
                    this.contextMenuOpen = false;
                    this.mouseScrollTimeStamp = 0;
                    this.mouseScrollDelta = 0;
                    this.touchSwipeState = null;
                }

                async request() {
                    const {
                        container,
                        pdfViewer
                    } = this;
                    if (this.active || !pdfViewer.pagesCount || !container.requestFullscreen) {
                        return false;
                    }
                    this.#addFullscreenChangeListeners();
                    this.#notifyStateChange(_ui_utils.PresentationModeState.CHANGING);
                    const promise = container.requestFullscreen();
                    this.#args = {
                        pageNumber: pdfViewer.currentPageNumber,
                        scaleValue: pdfViewer.currentScaleValue,
                        scrollMode: pdfViewer.scrollMode,
                        spreadMode: null,
                        annotationEditorMode: null
                    };
                    if (pdfViewer.spreadMode !== _ui_utils.SpreadMode.NONE && !(pdfViewer.pageViewsReady && pdfViewer.hasEqualPageSizes)) {
                        console.warn("Ignoring Spread modes when entering PresentationMode, " + "since the document may contain varying page sizes.");
                        this.#args.spreadMode = pdfViewer.spreadMode;
                    }
                    if (pdfViewer.annotationEditorMode !== _pdfjsLib.AnnotationEditorType.DISABLE) {
                        this.#args.annotationEditorMode = pdfViewer.annotationEditorMode;
                    }
                    try {
                        await promise;
                        pdfViewer.focus();
                        return true;
                    } catch {
                        this.#removeFullscreenChangeListeners();
                        this.#notifyStateChange(_ui_utils.PresentationModeState.NORMAL);
                    }
                    return false;
                }

                get active() {
                    return this.#state === _ui_utils.PresentationModeState.CHANGING || this.#state === _ui_utils.PresentationModeState.FULLSCREEN;
                }

                #mouseWheel(evt) {
                    if (!this.active) {
                        return;
                    }
                    evt.preventDefault();
                    const delta = (0, _ui_utils.normalizeWheelEventDelta)(evt);
                    const currentTime = Date.now();
                    const storedTime = this.mouseScrollTimeStamp;
                    if (currentTime > storedTime && currentTime - storedTime < MOUSE_SCROLL_COOLDOWN_TIME) {
                        return;
                    }
                    if (this.mouseScrollDelta > 0 && delta < 0 || this.mouseScrollDelta < 0 && delta > 0) {
                        this.#resetMouseScrollState();
                    }
                    this.mouseScrollDelta += delta;
                    if (Math.abs(this.mouseScrollDelta) >= PAGE_SWITCH_THRESHOLD) {
                        const totalDelta = this.mouseScrollDelta;
                        this.#resetMouseScrollState();
                        const success = totalDelta > 0 ? this.pdfViewer.previousPage() : this.pdfViewer.nextPage();
                        if (success) {
                            this.mouseScrollTimeStamp = currentTime;
                        }
                    }
                }

                #notifyStateChange(state) {
                    this.#state = state;
                    this.eventBus.dispatch("presentationmodechanged", {
                        source: this,
                        state
                    });
                }

                #enter() {
                    this.#notifyStateChange(_ui_utils.PresentationModeState.FULLSCREEN);
                    this.container.classList.add(ACTIVE_SELECTOR);
                    setTimeout(() => {
                        this.pdfViewer.scrollMode = _ui_utils.ScrollMode.PAGE;
                        if (this.#args.spreadMode !== null) {
                            this.pdfViewer.spreadMode = _ui_utils.SpreadMode.NONE;
                        }
                        this.pdfViewer.currentPageNumber = this.#args.pageNumber;
                        this.pdfViewer.currentScaleValue = "page-fit";
                        if (this.#args.annotationEditorMode !== null) {
                            this.pdfViewer.annotationEditorMode = {
                                mode: _pdfjsLib.AnnotationEditorType.NONE
                            };
                        }
                    }, 0);
                    this.#addWindowListeners();
                    this.#showControls();
                    this.contextMenuOpen = false;
                    window.getSelection().removeAllRanges();
                }

                #exit() {
                    const pageNumber = this.pdfViewer.currentPageNumber;
                    this.container.classList.remove(ACTIVE_SELECTOR);
                    setTimeout(() => {
                        this.#removeFullscreenChangeListeners();
                        this.#notifyStateChange(_ui_utils.PresentationModeState.NORMAL);
                        this.pdfViewer.scrollMode = this.#args.scrollMode;
                        if (this.#args.spreadMode !== null) {
                            this.pdfViewer.spreadMode = this.#args.spreadMode;
                        }
                        this.pdfViewer.currentScaleValue = this.#args.scaleValue;
                        this.pdfViewer.currentPageNumber = pageNumber;
                        if (this.#args.annotationEditorMode !== null) {
                            this.pdfViewer.annotationEditorMode = {
                                mode: this.#args.annotationEditorMode
                            };
                        }
                        this.#args = null;
                    }, 0);
                    this.#removeWindowListeners();
                    this.#hideControls();
                    this.#resetMouseScrollState();
                    this.contextMenuOpen = false;
                }

                #mouseDown(evt) {
                    if (this.contextMenuOpen) {
                        this.contextMenuOpen = false;
                        evt.preventDefault();
                        return;
                    }
                    if (evt.button !== 0) {
                        return;
                    }
                    if (evt.target.href && evt.target.parentNode?.hasAttribute("data-internal-link")) {
                        return;
                    }
                    evt.preventDefault();
                    if (evt.shiftKey) {
                        this.pdfViewer.previousPage();
                    } else {
                        this.pdfViewer.nextPage();
                    }
                }

                #contextMenu() {
                    this.contextMenuOpen = true;
                }

                #showControls() {
                    if (this.controlsTimeout) {
                        clearTimeout(this.controlsTimeout);
                    } else {
                        this.container.classList.add(CONTROLS_SELECTOR);
                    }
                    this.controlsTimeout = setTimeout(() => {
                        this.container.classList.remove(CONTROLS_SELECTOR);
                        delete this.controlsTimeout;
                    }, DELAY_BEFORE_HIDING_CONTROLS);
                }

                #hideControls() {
                    if (!this.controlsTimeout) {
                        return;
                    }
                    clearTimeout(this.controlsTimeout);
                    this.container.classList.remove(CONTROLS_SELECTOR);
                    delete this.controlsTimeout;
                }

                #resetMouseScrollState() {
                    this.mouseScrollTimeStamp = 0;
                    this.mouseScrollDelta = 0;
                }

                #touchSwipe(evt) {
                    if (!this.active) {
                        return;
                    }
                    if (evt.touches.length > 1) {
                        this.touchSwipeState = null;
                        return;
                    }
                    switch (evt.type) {
                        case "touchstart":
                            this.touchSwipeState = {
                                startX: evt.touches[0].pageX,
                                startY: evt.touches[0].pageY,
                                endX: evt.touches[0].pageX,
                                endY: evt.touches[0].pageY
                            };
                            break;
                        case "touchmove":
                            if (this.touchSwipeState === null) {
                                return;
                            }
                            this.touchSwipeState.endX = evt.touches[0].pageX;
                            this.touchSwipeState.endY = evt.touches[0].pageY;
                            evt.preventDefault();
                            break;
                        case "touchend":
                            if (this.touchSwipeState === null) {
                                return;
                            }
                            let delta = 0;
                            const dx = this.touchSwipeState.endX - this.touchSwipeState.startX;
                            const dy = this.touchSwipeState.endY - this.touchSwipeState.startY;
                            const absAngle = Math.abs(Math.atan2(dy, dx));
                            if (Math.abs(dx) > SWIPE_MIN_DISTANCE_THRESHOLD && (absAngle <= SWIPE_ANGLE_THRESHOLD || absAngle >= Math.PI - SWIPE_ANGLE_THRESHOLD)) {
                                delta = dx;
                            } else if (Math.abs(dy) > SWIPE_MIN_DISTANCE_THRESHOLD && Math.abs(absAngle - Math.PI / 2) <= SWIPE_ANGLE_THRESHOLD) {
                                delta = dy;
                            }
                            if (delta > 0) {
                                this.pdfViewer.previousPage();
                            } else if (delta < 0) {
                                this.pdfViewer.nextPage();
                            }
                            break;
                    }
                }

                #addWindowListeners() {
                    this.showControlsBind = this.#showControls.bind(this);
                    this.mouseDownBind = this.#mouseDown.bind(this);
                    this.mouseWheelBind = this.#mouseWheel.bind(this);
                    this.resetMouseScrollStateBind = this.#resetMouseScrollState.bind(this);
                    this.contextMenuBind = this.#contextMenu.bind(this);
                    this.touchSwipeBind = this.#touchSwipe.bind(this);
                    window.addEventListener("mousemove", this.showControlsBind);
                    window.addEventListener("mousedown", this.mouseDownBind);
                    window.addEventListener("wheel", this.mouseWheelBind, {
                        passive: false
                    });
                    window.addEventListener("keydown", this.resetMouseScrollStateBind);
                    window.addEventListener("contextmenu", this.contextMenuBind);
                    window.addEventListener("touchstart", this.touchSwipeBind);
                    window.addEventListener("touchmove", this.touchSwipeBind);
                    window.addEventListener("touchend", this.touchSwipeBind);
                }

                #removeWindowListeners() {
                    window.removeEventListener("mousemove", this.showControlsBind);
                    window.removeEventListener("mousedown", this.mouseDownBind);
                    window.removeEventListener("wheel", this.mouseWheelBind, {
                        passive: false
                    });
                    window.removeEventListener("keydown", this.resetMouseScrollStateBind);
                    window.removeEventListener("contextmenu", this.contextMenuBind);
                    window.removeEventListener("touchstart", this.touchSwipeBind);
                    window.removeEventListener("touchmove", this.touchSwipeBind);
                    window.removeEventListener("touchend", this.touchSwipeBind);
                    delete this.showControlsBind;
                    delete this.mouseDownBind;
                    delete this.mouseWheelBind;
                    delete this.resetMouseScrollStateBind;
                    delete this.contextMenuBind;
                    delete this.touchSwipeBind;
                }

                #fullscreenChange() {
                    if (document.fullscreenElement) {
                        this.#enter();
                    } else {
                        this.#exit();
                    }
                }

                #addFullscreenChangeListeners() {
                    this.fullscreenChangeBind = this.#fullscreenChange.bind(this);
                    window.addEventListener("fullscreenchange", this.fullscreenChangeBind);
                }

                #removeFullscreenChangeListeners() {
                    window.removeEventListener("fullscreenchange", this.fullscreenChangeBind);
                    delete this.fullscreenChangeBind;
                }
            }

            exports.PDFPresentationMode = PDFPresentationMode;

            /***/
        }),
        /* 24 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PDFRenderingQueue = void 0;
            var _pdfjsLib = __webpack_require__(4);
            var _ui_utils = __webpack_require__(3);
            const CLEANUP_TIMEOUT = 30000;

            class PDFRenderingQueue {
                constructor() {
                    this.pdfViewer = null;
                    this.pdfThumbnailViewer = null;
                    this.onIdle = null;
                    this.highestPriorityPage = null;
                    this.idleTimeout = null;
                    this.printing = false;
                    this.isThumbnailViewEnabled = false;
                    Object.defineProperty(this, "hasViewer", {
                        value: () => !!this.pdfViewer
                    });
                }

                setViewer(pdfViewer) {
                    this.pdfViewer = pdfViewer;
                }

                setThumbnailViewer(pdfThumbnailViewer) {
                    this.pdfThumbnailViewer = pdfThumbnailViewer;
                }

                isHighestPriority(view) {
                    return this.highestPriorityPage === view.renderingId;
                }

                renderHighestPriority(currentlyVisiblePages) {
                    if (this.idleTimeout) {
                        clearTimeout(this.idleTimeout);
                        this.idleTimeout = null;
                    }
                    if (this.pdfViewer.forceRendering(currentlyVisiblePages)) {
                        return;
                    }
                    if (this.isThumbnailViewEnabled && this.pdfThumbnailViewer?.forceRendering()) {
                        return;
                    }
                    if (this.printing) {
                        return;
                    }
                    if (this.onIdle) {
                        this.idleTimeout = setTimeout(this.onIdle.bind(this), CLEANUP_TIMEOUT);
                    }
                }

                getHighestPriority(visible, views, scrolledDown, preRenderExtra = false) {
                    const visibleViews = visible.views,
                        numVisible = visibleViews.length;
                    if (numVisible === 0) {
                        return null;
                    }
                    for (let i = 0; i < numVisible; i++) {
                        const view = visibleViews[i].view;
                        if (!this.isViewFinished(view)) {
                            return view;
                        }
                    }
                    const firstId = visible.first.id,
                        lastId = visible.last.id;
                    if (lastId - firstId + 1 > numVisible) {
                        const visibleIds = visible.ids;
                        for (let i = 1, ii = lastId - firstId; i < ii; i++) {
                            const holeId = scrolledDown ? firstId + i : lastId - i;
                            if (visibleIds.has(holeId)) {
                                continue;
                            }
                            const holeView = views[holeId - 1];
                            if (!this.isViewFinished(holeView)) {
                                return holeView;
                            }
                        }
                    }
                    let preRenderIndex = scrolledDown ? lastId : firstId - 2;
                    let preRenderView = views[preRenderIndex];
                    if (preRenderView && !this.isViewFinished(preRenderView)) {
                        return preRenderView;
                    }
                    if (preRenderExtra) {
                        preRenderIndex += scrolledDown ? 1 : -1;
                        preRenderView = views[preRenderIndex];
                        if (preRenderView && !this.isViewFinished(preRenderView)) {
                            return preRenderView;
                        }
                    }
                    return null;
                }

                isViewFinished(view) {
                    return view.renderingState === _ui_utils.RenderingStates.FINISHED;
                }

                renderView(view) {
                    switch (view.renderingState) {
                        case _ui_utils.RenderingStates.FINISHED:
                            return false;
                        case _ui_utils.RenderingStates.PAUSED:
                            this.highestPriorityPage = view.renderingId;
                            view.resume();
                            break;
                        case _ui_utils.RenderingStates.RUNNING:
                            this.highestPriorityPage = view.renderingId;
                            break;
                        case _ui_utils.RenderingStates.INITIAL:
                            this.highestPriorityPage = view.renderingId;
                            view.draw().finally(() => {
                                this.renderHighestPriority();
                            }).catch(reason => {
                                if (reason instanceof _pdfjsLib.RenderingCancelledException) {
                                    return;
                                }
                                console.error(`renderView: "${reason}"`);
                            });
                            break;
                    }
                    return true;
                }
            }

            exports.PDFRenderingQueue = PDFRenderingQueue;

            /***/
        }),
        /* 25 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PDFScriptingManager = void 0;
            var _ui_utils = __webpack_require__(3);
            var _pdfjsLib = __webpack_require__(4);

            class PDFScriptingManager {
                #closeCapability = null;
                #destroyCapability = null;
                #docProperties = null;
                #eventBus = null;
                #externalServices = null;
                #pdfDocument = null;
                #pdfViewer = null;
                #ready = false;
                #sandboxBundleSrc = null;
                #scripting = null;
                #willPrintCapability = null;

                constructor({
                                eventBus,
                                sandboxBundleSrc = null,
                                externalServices = null,
                                docProperties = null
                            }) {
                    this.#eventBus = eventBus;
                    this.#sandboxBundleSrc = sandboxBundleSrc;
                    this.#externalServices = externalServices;
                    this.#docProperties = docProperties;
                }

                setViewer(pdfViewer) {
                    this.#pdfViewer = pdfViewer;
                }

                async setDocument(pdfDocument) {
                    if (this.#pdfDocument) {
                        await this.#destroyScripting();
                    }
                    this.#pdfDocument = pdfDocument;
                    if (!pdfDocument) {
                        return;
                    }
                    const [objects, calculationOrder, docActions] = await Promise.all([pdfDocument.getFieldObjects(), pdfDocument.getCalculationOrderIds(), pdfDocument.getJSActions()]);
                    if (!objects && !docActions) {
                        await this.#destroyScripting();
                        return;
                    }
                    if (pdfDocument !== this.#pdfDocument) {
                        return;
                    }
                    try {
                        this.#scripting = this.#initScripting();
                    } catch (error) {
                        console.error(`setDocument: "${error.message}".`);
                        await this.#destroyScripting();
                        return;
                    }
                    this._internalEvents.set("updatefromsandbox", event => {
                        if (event?.source === window) {
                            this.#updateFromSandbox(event.detail);
                        }
                    });
                    this._internalEvents.set("dispatcheventinsandbox", event => {
                        this.#scripting?.dispatchEventInSandbox(event.detail);
                    });
                    this._internalEvents.set("pagechanging", ({
                                                                  pageNumber,
                                                                  previous
                                                              }) => {
                        if (pageNumber === previous) {
                            return;
                        }
                        this.#dispatchPageClose(previous);
                        this.#dispatchPageOpen(pageNumber);
                    });
                    this._internalEvents.set("pagerendered", ({
                                                                  pageNumber
                                                              }) => {
                        if (!this._pageOpenPending.has(pageNumber)) {
                            return;
                        }
                        if (pageNumber !== this.#pdfViewer.currentPageNumber) {
                            return;
                        }
                        this.#dispatchPageOpen(pageNumber);
                    });
                    this._internalEvents.set("pagesdestroy", async () => {
                        await this.#dispatchPageClose(this.#pdfViewer.currentPageNumber);
                        await this.#scripting?.dispatchEventInSandbox({
                            id: "doc",
                            name: "WillClose"
                        });
                        this.#closeCapability?.resolve();
                    });
                    for (const [name, listener] of this._internalEvents) {
                        this.#eventBus._on(name, listener);
                    }
                    try {
                        const docProperties = await this.#docProperties(pdfDocument);
                        if (pdfDocument !== this.#pdfDocument) {
                            return;
                        }
                        await this.#scripting.createSandbox({
                            objects,
                            calculationOrder,
                            appInfo: {
                                platform: navigator.platform,
                                language: navigator.language
                            },
                            docInfo: {
                                ...docProperties,
                                actions: docActions
                            }
                        });
                        this.#eventBus.dispatch("sandboxcreated", {
                            source: this
                        });
                    } catch (error) {
                        console.error(`setDocument: "${error.message}".`);
                        await this.#destroyScripting();
                        return;
                    }
                    await this.#scripting?.dispatchEventInSandbox({
                        id: "doc",
                        name: "Open"
                    });
                    await this.#dispatchPageOpen(this.#pdfViewer.currentPageNumber, true);
                    Promise.resolve().then(() => {
                        if (pdfDocument === this.#pdfDocument) {
                            this.#ready = true;
                        }
                    });
                }

                async dispatchWillSave() {
                    return this.#scripting?.dispatchEventInSandbox({
                        id: "doc",
                        name: "WillSave"
                    });
                }

                async dispatchDidSave() {
                    return this.#scripting?.dispatchEventInSandbox({
                        id: "doc",
                        name: "DidSave"
                    });
                }

                async dispatchWillPrint() {
                    if (!this.#scripting) {
                        return;
                    }
                    await this.#willPrintCapability?.promise;
                    this.#willPrintCapability = new _pdfjsLib.PromiseCapability();
                    try {
                        await this.#scripting.dispatchEventInSandbox({
                            id: "doc",
                            name: "WillPrint"
                        });
                    } catch (ex) {
                        this.#willPrintCapability.resolve();
                        this.#willPrintCapability = null;
                        throw ex;
                    }
                    await this.#willPrintCapability.promise;
                }

                async dispatchDidPrint() {
                    return this.#scripting?.dispatchEventInSandbox({
                        id: "doc",
                        name: "DidPrint"
                    });
                }

                get destroyPromise() {
                    return this.#destroyCapability?.promise || null;
                }

                get ready() {
                    return this.#ready;
                }

                get _internalEvents() {
                    return (0, _pdfjsLib.shadow)(this, "_internalEvents", new Map());
                }

                get _pageOpenPending() {
                    return (0, _pdfjsLib.shadow)(this, "_pageOpenPending", new Set());
                }

                get _visitedPages() {
                    return (0, _pdfjsLib.shadow)(this, "_visitedPages", new Map());
                }

                async #updateFromSandbox(detail) {
                    const pdfViewer = this.#pdfViewer;
                    const isInPresentationMode = pdfViewer.isInPresentationMode || pdfViewer.isChangingPresentationMode;
                    const {
                        id,
                        siblings,
                        command,
                        value
                    } = detail;
                    if (!id) {
                        switch (command) {
                            case "clear":
                                console.clear();
                                break;
                            case "error":
                                console.error(value);
                                break;
                            case "layout":
                                if (!isInPresentationMode) {
                                    const modes = (0, _ui_utils.apiPageLayoutToViewerModes)(value);
                                    pdfViewer.spreadMode = modes.spreadMode;
                                }
                                break;
                            case "page-num":
                                pdfViewer.currentPageNumber = value + 1;
                                break;
                            case "print":
                                await pdfViewer.pagesPromise;
                                this.#eventBus.dispatch("print", {
                                    source: this
                                });
                                break;
                            case "println":
                                console.log(value);
                                break;
                            case "zoom":
                                if (!isInPresentationMode) {
                                    pdfViewer.currentScaleValue = value;
                                }
                                break;
                            case "SaveAs":
                                this.#eventBus.dispatch("download", {
                                    source: this
                                });
                                break;
                            case "FirstPage":
                                pdfViewer.currentPageNumber = 1;
                                break;
                            case "LastPage":
                                pdfViewer.currentPageNumber = pdfViewer.pagesCount;
                                break;
                            case "NextPage":
                                pdfViewer.nextPage();
                                break;
                            case "PrevPage":
                                pdfViewer.previousPage();
                                break;
                            case "ZoomViewIn":
                                if (!isInPresentationMode) {
                                    pdfViewer.increaseScale();
                                }
                                break;
                            case "ZoomViewOut":
                                if (!isInPresentationMode) {
                                    pdfViewer.decreaseScale();
                                }
                                break;
                            case "WillPrintFinished":
                                this.#willPrintCapability?.resolve();
                                this.#willPrintCapability = null;
                                break;
                        }
                        return;
                    }
                    if (isInPresentationMode && detail.focus) {
                        return;
                    }
                    delete detail.id;
                    delete detail.siblings;
                    const ids = siblings ? [id, ...siblings] : [id];
                    for (const elementId of ids) {
                        const element = document.querySelector(`[data-element-id="${elementId}"]`);
                        if (element) {
                            element.dispatchEvent(new CustomEvent("updatefromsandbox", {
                                detail
                            }));
                        } else {
                            this.#pdfDocument?.annotationStorage.setValue(elementId, detail);
                        }
                    }
                }

                async #dispatchPageOpen(pageNumber, initialize = false) {
                    const pdfDocument = this.#pdfDocument,
                        visitedPages = this._visitedPages;
                    if (initialize) {
                        this.#closeCapability = new _pdfjsLib.PromiseCapability();
                    }
                    if (!this.#closeCapability) {
                        return;
                    }
                    const pageView = this.#pdfViewer.getPageView(pageNumber - 1);
                    if (pageView?.renderingState !== _ui_utils.RenderingStates.FINISHED) {
                        this._pageOpenPending.add(pageNumber);
                        return;
                    }
                    this._pageOpenPending.delete(pageNumber);
                    const actionsPromise = (async () => {
                        const actions = await (!visitedPages.has(pageNumber) ? pageView.pdfPage?.getJSActions() : null);
                        if (pdfDocument !== this.#pdfDocument) {
                            return;
                        }
                        await this.#scripting?.dispatchEventInSandbox({
                            id: "page",
                            name: "PageOpen",
                            pageNumber,
                            actions
                        });
                    })();
                    visitedPages.set(pageNumber, actionsPromise);
                }

                async #dispatchPageClose(pageNumber) {
                    const pdfDocument = this.#pdfDocument,
                        visitedPages = this._visitedPages;
                    if (!this.#closeCapability) {
                        return;
                    }
                    if (this._pageOpenPending.has(pageNumber)) {
                        return;
                    }
                    const actionsPromise = visitedPages.get(pageNumber);
                    if (!actionsPromise) {
                        return;
                    }
                    visitedPages.set(pageNumber, null);
                    await actionsPromise;
                    if (pdfDocument !== this.#pdfDocument) {
                        return;
                    }
                    await this.#scripting?.dispatchEventInSandbox({
                        id: "page",
                        name: "PageClose",
                        pageNumber
                    });
                }

                #initScripting() {
                    this.#destroyCapability = new _pdfjsLib.PromiseCapability();
                    if (this.#scripting) {
                        throw new Error("#initScripting: Scripting already exists.");
                    }
                    return this.#externalServices.createScripting({
                        sandboxBundleSrc: this.#sandboxBundleSrc
                    });
                }

                async #destroyScripting() {
                    if (!this.#scripting) {
                        this.#pdfDocument = null;
                        this.#destroyCapability?.resolve();
                        return;
                    }
                    if (this.#closeCapability) {
                        await Promise.race([this.#closeCapability.promise, new Promise(resolve => {
                            setTimeout(resolve, 1000);
                        })]).catch(() => {
                        });
                        this.#closeCapability = null;
                    }
                    this.#pdfDocument = null;
                    try {
                        await this.#scripting.destroySandbox();
                    } catch {
                    }
                    this.#willPrintCapability?.reject(new Error("Scripting destroyed."));
                    this.#willPrintCapability = null;
                    for (const [name, listener] of this._internalEvents) {
                        this.#eventBus._off(name, listener);
                    }
                    this._internalEvents.clear();
                    this._pageOpenPending.clear();
                    this._visitedPages.clear();
                    this.#scripting = null;
                    this.#ready = false;
                    this.#destroyCapability?.resolve();
                }
            }

            exports.PDFScriptingManager = PDFScriptingManager;

            /***/
        }),
        /* 26 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PDFSidebar = void 0;
            var _ui_utils = __webpack_require__(3);
            const SIDEBAR_WIDTH_VAR = "--sidebar-width";
            const SIDEBAR_MIN_WIDTH = 200;
            const SIDEBAR_RESIZING_CLASS = "sidebarResizing";
            const UI_NOTIFICATION_CLASS = "pdfSidebarNotification";

            class PDFSidebar {
                #isRTL = false;
                #mouseMoveBound = this.#mouseMove.bind(this);
                #mouseUpBound = this.#mouseUp.bind(this);
                #outerContainerWidth = null;
                #width = null;

                constructor({
                                elements,
                                eventBus,
                                l10n
                            }) {
                    this.isOpen = false;
                    this.active = _ui_utils.SidebarView.THUMBS;
                    this.isInitialViewSet = false;
                    this.isInitialEventDispatched = false;
                    this.onToggled = null;
                    this.onUpdateThumbnails = null;
                    this.outerContainer = elements.outerContainer;
                    this.sidebarContainer = elements.sidebarContainer;
                    this.toggleButton = elements.toggleButton;
                    this.resizer = elements.resizer;
                    this.thumbnailButton = elements.thumbnailButton;
                    this.outlineButton = elements.outlineButton;
                    this.attachmentsButton = elements.attachmentsButton;
                    this.layersButton = elements.layersButton;
                    this.thumbnailView = elements.thumbnailView;
                    this.outlineView = elements.outlineView;
                    this.attachmentsView = elements.attachmentsView;
                    this.layersView = elements.layersView;
                    this._outlineOptionsContainer = elements.outlineOptionsContainer;
                    this._currentOutlineItemButton = elements.currentOutlineItemButton;
                    this.eventBus = eventBus;
                    this.l10n = l10n;
                    l10n.getDirection().then(dir => {
                        this.#isRTL = dir === "rtl";
                    });
                    this.#addEventListeners();
                }

                reset() {
                    this.isInitialViewSet = false;
                    this.isInitialEventDispatched = false;
                    this.#hideUINotification(true);
                    this.switchView(_ui_utils.SidebarView.THUMBS);
                    this.outlineButton.disabled = false;
                    this.attachmentsButton.disabled = false;
                    this.layersButton.disabled = false;
                    this._currentOutlineItemButton.disabled = true;
                }

                get visibleView() {
                    return this.isOpen ? this.active : _ui_utils.SidebarView.NONE;
                }

                setInitialView(view = _ui_utils.SidebarView.NONE) {
                    if (this.isInitialViewSet) {
                        return;
                    }
                    this.isInitialViewSet = true;
                    if (view === _ui_utils.SidebarView.NONE || view === _ui_utils.SidebarView.UNKNOWN) {
                        this.#dispatchEvent();
                        return;
                    }
                    this.switchView(view, true);
                    if (!this.isInitialEventDispatched) {
                        this.#dispatchEvent();
                    }
                }

                switchView(view, forceOpen = false) {
                    const isViewChanged = view !== this.active;
                    let forceRendering = false;
                    switch (view) {
                        case _ui_utils.SidebarView.NONE:
                            if (this.isOpen) {
                                this.close();
                            }
                            return;
                        case _ui_utils.SidebarView.THUMBS:
                            if (this.isOpen && isViewChanged) {
                                forceRendering = true;
                            }
                            break;
                        case _ui_utils.SidebarView.OUTLINE:
                            if (this.outlineButton.disabled) {
                                return;
                            }
                            break;
                        case _ui_utils.SidebarView.ATTACHMENTS:
                            if (this.attachmentsButton.disabled) {
                                return;
                            }
                            break;
                        case _ui_utils.SidebarView.LAYERS:
                            if (this.layersButton.disabled) {
                                return;
                            }
                            break;
                        default:
                            console.error(`PDFSidebar.switchView: "${view}" is not a valid view.`);
                            return;
                    }
                    this.active = view;
                    (0, _ui_utils.toggleCheckedBtn)(this.thumbnailButton, view === _ui_utils.SidebarView.THUMBS, this.thumbnailView);
                    (0, _ui_utils.toggleCheckedBtn)(this.outlineButton, view === _ui_utils.SidebarView.OUTLINE, this.outlineView);
                    (0, _ui_utils.toggleCheckedBtn)(this.attachmentsButton, view === _ui_utils.SidebarView.ATTACHMENTS, this.attachmentsView);
                    (0, _ui_utils.toggleCheckedBtn)(this.layersButton, view === _ui_utils.SidebarView.LAYERS, this.layersView);
                    this._outlineOptionsContainer.classList.toggle("hidden", view !== _ui_utils.SidebarView.OUTLINE);
                    if (forceOpen && !this.isOpen) {
                        this.open();
                        return;
                    }
                    if (forceRendering) {
                        this.onUpdateThumbnails();
                        this.onToggled();
                    }
                    if (isViewChanged) {
                        this.#dispatchEvent();
                    }
                }

                open() {
                    if (this.isOpen) {
                        return;
                    }
                    this.isOpen = true;
                    (0, _ui_utils.toggleExpandedBtn)(this.toggleButton, true);
                    this.outerContainer.classList.add("sidebarMoving", "sidebarOpen");
                    if (this.active === _ui_utils.SidebarView.THUMBS) {
                        this.onUpdateThumbnails();
                    }
                    this.onToggled();
                    this.#dispatchEvent();
                    this.#hideUINotification();
                }

                close() {
                    if (!this.isOpen) {
                        return;
                    }
                    this.isOpen = false;
                    (0, _ui_utils.toggleExpandedBtn)(this.toggleButton, false);
                    this.outerContainer.classList.add("sidebarMoving");
                    this.outerContainer.classList.remove("sidebarOpen");
                    this.onToggled();
                    this.#dispatchEvent();
                }

                toggle() {
                    if (this.isOpen) {
                        this.close();
                    } else {
                        this.open();
                    }
                }

                #dispatchEvent() {
                    if (this.isInitialViewSet) {
                        this.isInitialEventDispatched ||= true;
                    }
                    this.eventBus.dispatch("sidebarviewchanged", {
                        source: this,
                        view: this.visibleView
                    });
                }

                #showUINotification() {
                    this.toggleButton.setAttribute("data-l10n-id", "toggle_sidebar_notification2");
                    this.l10n.translate(this.toggleButton);
                    if (!this.isOpen) {
                        this.toggleButton.classList.add(UI_NOTIFICATION_CLASS);
                    }
                }

                #hideUINotification(reset = false) {
                    if (this.isOpen || reset) {
                        this.toggleButton.classList.remove(UI_NOTIFICATION_CLASS);
                    }
                    if (reset) {
                        this.toggleButton.setAttribute("data-l10n-id", "toggle_sidebar");
                        this.l10n.translate(this.toggleButton);
                    }
                }

                #addEventListeners() {
                    this.sidebarContainer.addEventListener("transitionend", evt => {
                        if (evt.target === this.sidebarContainer) {
                            this.outerContainer.classList.remove("sidebarMoving");
                        }
                    });
                    this.toggleButton.addEventListener("click", () => {
                        this.toggle();
                    });
                    this.thumbnailButton.addEventListener("click", () => {
                        this.switchView(_ui_utils.SidebarView.THUMBS);
                    });
                    this.outlineButton.addEventListener("click", () => {
                        this.switchView(_ui_utils.SidebarView.OUTLINE);
                    });
                    this.outlineButton.addEventListener("dblclick", () => {
                        this.eventBus.dispatch("toggleoutlinetree", {
                            source: this
                        });
                    });
                    this.attachmentsButton.addEventListener("click", () => {
                        this.switchView(_ui_utils.SidebarView.ATTACHMENTS);
                    });
                    this.layersButton.addEventListener("click", () => {
                        this.switchView(_ui_utils.SidebarView.LAYERS);
                    });
                    this.layersButton.addEventListener("dblclick", () => {
                        this.eventBus.dispatch("resetlayers", {
                            source: this
                        });
                    });
                    this._currentOutlineItemButton.addEventListener("click", () => {
                        this.eventBus.dispatch("currentoutlineitem", {
                            source: this
                        });
                    });
                    const onTreeLoaded = (count, button, view) => {
                        button.disabled = !count;
                        if (count) {
                            this.#showUINotification();
                        } else if (this.active === view) {
                            this.switchView(_ui_utils.SidebarView.THUMBS);
                        }
                    };
                    this.eventBus._on("outlineloaded", evt => {
                        onTreeLoaded(evt.outlineCount, this.outlineButton, _ui_utils.SidebarView.OUTLINE);
                        evt.currentOutlineItemPromise.then(enabled => {
                            if (!this.isInitialViewSet) {
                                return;
                            }
                            this._currentOutlineItemButton.disabled = !enabled;
                        });
                    });
                    this.eventBus._on("attachmentsloaded", evt => {
                        onTreeLoaded(evt.attachmentsCount, this.attachmentsButton, _ui_utils.SidebarView.ATTACHMENTS);
                    });
                    this.eventBus._on("layersloaded", evt => {
                        onTreeLoaded(evt.layersCount, this.layersButton, _ui_utils.SidebarView.LAYERS);
                    });
                    this.eventBus._on("presentationmodechanged", evt => {
                        if (evt.state === _ui_utils.PresentationModeState.NORMAL && this.visibleView === _ui_utils.SidebarView.THUMBS) {
                            this.onUpdateThumbnails();
                        }
                    });
                    this.resizer.addEventListener("mousedown", evt => {
                        if (evt.button !== 0) {
                            return;
                        }
                        this.outerContainer.classList.add(SIDEBAR_RESIZING_CLASS);
                        window.addEventListener("mousemove", this.#mouseMoveBound);
                        window.addEventListener("mouseup", this.#mouseUpBound);
                    });
                    this.eventBus._on("resize", evt => {
                        if (evt.source !== window) {
                            return;
                        }
                        this.#outerContainerWidth = null;
                        if (!this.#width) {
                            return;
                        }
                        if (!this.isOpen) {
                            this.#updateWidth(this.#width);
                            return;
                        }
                        this.outerContainer.classList.add(SIDEBAR_RESIZING_CLASS);
                        const updated = this.#updateWidth(this.#width);
                        Promise.resolve().then(() => {
                            this.outerContainer.classList.remove(SIDEBAR_RESIZING_CLASS);
                            if (updated) {
                                this.eventBus.dispatch("resize", {
                                    source: this
                                });
                            }
                        });
                    });
                }

                get outerContainerWidth() {
                    return this.#outerContainerWidth ||= this.outerContainer.clientWidth;
                }

                #updateWidth(width = 0) {
                    const maxWidth = Math.floor(this.outerContainerWidth / 2);
                    if (width > maxWidth) {
                        width = maxWidth;
                    }
                    if (width < SIDEBAR_MIN_WIDTH) {
                        width = SIDEBAR_MIN_WIDTH;
                    }
                    if (width === this.#width) {
                        return false;
                    }
                    this.#width = width;
                    _ui_utils.docStyle.setProperty(SIDEBAR_WIDTH_VAR, `${width}px`);
                    return true;
                }

                #mouseMove(evt) {
                    let width = evt.clientX;
                    if (this.#isRTL) {
                        width = this.outerContainerWidth - width;
                    }
                    this.#updateWidth(width);
                }

                #mouseUp(evt) {
                    this.outerContainer.classList.remove(SIDEBAR_RESIZING_CLASS);
                    this.eventBus.dispatch("resize", {
                        source: this
                    });
                    window.removeEventListener("mousemove", this.#mouseMoveBound);
                    window.removeEventListener("mouseup", this.#mouseUpBound);
                }
            }

            exports.PDFSidebar = PDFSidebar;

            /***/
        }),
        /* 27 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PDFThumbnailViewer = void 0;
            var _ui_utils = __webpack_require__(3);
            var _pdf_thumbnail_view = __webpack_require__(28);
            const THUMBNAIL_SCROLL_MARGIN = -19;
            const THUMBNAIL_SELECTED_CLASS = "selected";

            class PDFThumbnailViewer {
                constructor({
                                container,
                                eventBus,
                                linkService,
                                renderingQueue,
                                l10n,
                                pageColors
                            }) {
                    this.container = container;
                    this.eventBus = eventBus;
                    this.linkService = linkService;
                    this.renderingQueue = renderingQueue;
                    this.l10n = l10n;
                    this.pageColors = pageColors || null;
                    this.scroll = (0, _ui_utils.watchScroll)(this.container, this._scrollUpdated.bind(this));
                    this._resetView();
                }

                _scrollUpdated() {
                    this.renderingQueue.renderHighestPriority();
                }

                getThumbnail(index) {
                    return this._thumbnails[index];
                }

                _getVisibleThumbs() {
                    return (0, _ui_utils.getVisibleElements)({
                        scrollEl: this.container,
                        views: this._thumbnails
                    });
                }

                scrollThumbnailIntoView(pageNumber) {
                    if (!this.pdfDocument) {
                        return;
                    }
                    const thumbnailView = this._thumbnails[pageNumber - 1];
                    if (!thumbnailView) {
                        console.error('scrollThumbnailIntoView: Invalid "pageNumber" parameter.');
                        return;
                    }
                    if (pageNumber !== this._currentPageNumber) {
                        const prevThumbnailView = this._thumbnails[this._currentPageNumber - 1];
                        prevThumbnailView.div.classList.remove(THUMBNAIL_SELECTED_CLASS);
                        thumbnailView.div.classList.add(THUMBNAIL_SELECTED_CLASS);
                    }
                    const {
                        first,
                        last,
                        views
                    } = this._getVisibleThumbs();
                    if (views.length > 0) {
                        let shouldScroll = false;
                        if (pageNumber <= first.id || pageNumber >= last.id) {
                            shouldScroll = true;
                        } else {
                            for (const {
                                id,
                                percent
                            } of views) {
                                if (id !== pageNumber) {
                                    continue;
                                }
                                shouldScroll = percent < 100;
                                break;
                            }
                        }
                        if (shouldScroll) {
                            (0, _ui_utils.scrollIntoView)(thumbnailView.div, {
                                top: THUMBNAIL_SCROLL_MARGIN
                            });
                        }
                    }
                    this._currentPageNumber = pageNumber;
                }

                get pagesRotation() {
                    return this._pagesRotation;
                }

                set pagesRotation(rotation) {
                    if (!(0, _ui_utils.isValidRotation)(rotation)) {
                        throw new Error("Invalid thumbnails rotation angle.");
                    }
                    if (!this.pdfDocument) {
                        return;
                    }
                    if (this._pagesRotation === rotation) {
                        return;
                    }
                    this._pagesRotation = rotation;
                    const updateArgs = {
                        rotation
                    };
                    for (const thumbnail of this._thumbnails) {
                        thumbnail.update(updateArgs);
                    }
                }

                cleanup() {
                    for (const thumbnail of this._thumbnails) {
                        if (thumbnail.renderingState !== _ui_utils.RenderingStates.FINISHED) {
                            thumbnail.reset();
                        }
                    }
                    _pdf_thumbnail_view.TempImageFactory.destroyCanvas();
                }

                _resetView() {
                    this._thumbnails = [];
                    this._currentPageNumber = 1;
                    this._pageLabels = null;
                    this._pagesRotation = 0;
                    this.container.textContent = "";
                }

                setDocument(pdfDocument) {
                    if (this.pdfDocument) {
                        this._cancelRendering();
                        this._resetView();
                    }
                    this.pdfDocument = pdfDocument;
                    if (!pdfDocument) {
                        return;
                    }
                    const firstPagePromise = pdfDocument.getPage(1);
                    const optionalContentConfigPromise = pdfDocument.getOptionalContentConfig();
                    firstPagePromise.then(firstPdfPage => {
                        const pagesCount = pdfDocument.numPages;
                        const viewport = firstPdfPage.getViewport({
                            scale: 1
                        });
                        for (let pageNum = 1; pageNum <= pagesCount; ++pageNum) {
                            const thumbnail = new _pdf_thumbnail_view.PDFThumbnailView({
                                container: this.container,
                                eventBus: this.eventBus,
                                id: pageNum,
                                defaultViewport: viewport.clone(),
                                optionalContentConfigPromise,
                                linkService: this.linkService,
                                renderingQueue: this.renderingQueue,
                                l10n: this.l10n,
                                pageColors: this.pageColors
                            });
                            this._thumbnails.push(thumbnail);
                        }
                        this._thumbnails[0]?.setPdfPage(firstPdfPage);
                        const thumbnailView = this._thumbnails[this._currentPageNumber - 1];
                        thumbnailView.div.classList.add(THUMBNAIL_SELECTED_CLASS);
                    }).catch(reason => {
                        console.error("Unable to initialize thumbnail viewer", reason);
                    });
                }

                _cancelRendering() {
                    for (const thumbnail of this._thumbnails) {
                        thumbnail.cancelRendering();
                    }
                }

                setPageLabels(labels) {
                    if (!this.pdfDocument) {
                        return;
                    }
                    if (!labels) {
                        this._pageLabels = null;
                    } else if (!(Array.isArray(labels) && this.pdfDocument.numPages === labels.length)) {
                        this._pageLabels = null;
                        console.error("PDFThumbnailViewer_setPageLabels: Invalid page labels.");
                    } else {
                        this._pageLabels = labels;
                    }
                    for (let i = 0, ii = this._thumbnails.length; i < ii; i++) {
                        this._thumbnails[i].setPageLabel(this._pageLabels?.[i] ?? null);
                    }
                }

                async #ensurePdfPageLoaded(thumbView) {
                    if (thumbView.pdfPage) {
                        return thumbView.pdfPage;
                    }
                    try {
                        const pdfPage = await this.pdfDocument.getPage(thumbView.id);
                        if (!thumbView.pdfPage) {
                            thumbView.setPdfPage(pdfPage);
                        }
                        return pdfPage;
                    } catch (reason) {
                        console.error("Unable to get page for thumb view", reason);
                        return null;
                    }
                }

                #getScrollAhead(visible) {
                    if (visible.first?.id === 1) {
                        return true;
                    } else if (visible.last?.id === this._thumbnails.length) {
                        return false;
                    }
                    return this.scroll.down;
                }

                forceRendering() {
                    const visibleThumbs = this._getVisibleThumbs();
                    const scrollAhead = this.#getScrollAhead(visibleThumbs);
                    const thumbView = this.renderingQueue.getHighestPriority(visibleThumbs, this._thumbnails, scrollAhead);
                    if (thumbView) {
                        this.#ensurePdfPageLoaded(thumbView).then(() => {
                            this.renderingQueue.renderView(thumbView);
                        });
                        return true;
                    }
                    return false;
                }
            }

            exports.PDFThumbnailViewer = PDFThumbnailViewer;

            /***/
        }),
        /* 28 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.TempImageFactory = exports.PDFThumbnailView = void 0;
            var _ui_utils = __webpack_require__(3);
            var _pdfjsLib = __webpack_require__(4);
            const DRAW_UPSCALE_FACTOR = 2;
            const MAX_NUM_SCALING_STEPS = 3;
            const THUMBNAIL_WIDTH = 98;

            class TempImageFactory {
                static #tempCanvas = null;

                static getCanvas(width, height) {
                    const tempCanvas = this.#tempCanvas ||= document.createElement("canvas");
                    tempCanvas.width = width;
                    tempCanvas.height = height;
                    const ctx = tempCanvas.getContext("2d", {
                        alpha: false
                    });
                    ctx.save();
                    ctx.fillStyle = "rgb(255, 255, 255)";
                    ctx.fillRect(0, 0, width, height);
                    ctx.restore();
                    return [tempCanvas, tempCanvas.getContext("2d")];
                }

                static destroyCanvas() {
                    const tempCanvas = this.#tempCanvas;
                    if (tempCanvas) {
                        tempCanvas.width = 0;
                        tempCanvas.height = 0;
                    }
                    this.#tempCanvas = null;
                }
            }

            exports.TempImageFactory = TempImageFactory;

            class PDFThumbnailView {
                constructor({
                                container,
                                eventBus,
                                id,
                                defaultViewport,
                                optionalContentConfigPromise,
                                linkService,
                                renderingQueue,
                                l10n,
                                pageColors
                            }) {
                    this.id = id;
                    this.renderingId = "thumbnail" + id;
                    this.pageLabel = null;
                    this.pdfPage = null;
                    this.rotation = 0;
                    this.viewport = defaultViewport;
                    this.pdfPageRotate = defaultViewport.rotation;
                    this._optionalContentConfigPromise = optionalContentConfigPromise || null;
                    this.pageColors = pageColors || null;
                    this.eventBus = eventBus;
                    this.linkService = linkService;
                    this.renderingQueue = renderingQueue;
                    this.renderTask = null;
                    this.renderingState = _ui_utils.RenderingStates.INITIAL;
                    this.resume = null;
                    this.l10n = l10n;
                    const anchor = document.createElement("a");
                    anchor.href = linkService.getAnchorUrl("#page=" + id);
                    this._thumbPageTitle.then(msg => {
                        anchor.title = msg;
                    });
                    anchor.onclick = function () {
                        linkService.goToPage(id);
                        return false;
                    };
                    this.anchor = anchor;
                    const div = document.createElement("div");
                    div.className = "thumbnail";
                    div.setAttribute("data-page-number", this.id);
                    this.div = div;
                    this.#updateDims();
                    const img = document.createElement("div");
                    img.className = "thumbnailImage";
                    this._placeholderImg = img;
                    div.append(img);
                    anchor.append(div);
                    container.append(anchor);
                }

                #updateDims() {
                    const {
                        width,
                        height
                    } = this.viewport;
                    const ratio = width / height;
                    this.canvasWidth = THUMBNAIL_WIDTH;
                    this.canvasHeight = this.canvasWidth / ratio | 0;
                    this.scale = this.canvasWidth / width;
                    const {
                        style
                    } = this.div;
                    style.setProperty("--thumbnail-width", `${this.canvasWidth}px`);
                    style.setProperty("--thumbnail-height", `${this.canvasHeight}px`);
                }

                setPdfPage(pdfPage) {
                    this.pdfPage = pdfPage;
                    this.pdfPageRotate = pdfPage.rotate;
                    const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
                    this.viewport = pdfPage.getViewport({
                        scale: 1,
                        rotation: totalRotation
                    });
                    this.reset();
                }

                reset() {
                    this.cancelRendering();
                    this.renderingState = _ui_utils.RenderingStates.INITIAL;
                    this.div.removeAttribute("data-loaded");
                    this.image?.replaceWith(this._placeholderImg);
                    this.#updateDims();
                    if (this.image) {
                        this.image.removeAttribute("src");
                        delete this.image;
                    }
                }

                update({
                           rotation = null
                       }) {
                    if (typeof rotation === "number") {
                        this.rotation = rotation;
                    }
                    const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
                    this.viewport = this.viewport.clone({
                        scale: 1,
                        rotation: totalRotation
                    });
                    this.reset();
                }

                cancelRendering() {
                    if (this.renderTask) {
                        this.renderTask.cancel();
                        this.renderTask = null;
                    }
                    this.resume = null;
                }

                _getPageDrawContext(upscaleFactor = 1) {
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d", {
                        alpha: false
                    });
                    const outputScale = new _ui_utils.OutputScale();
                    canvas.width = upscaleFactor * this.canvasWidth * outputScale.sx | 0;
                    canvas.height = upscaleFactor * this.canvasHeight * outputScale.sy | 0;
                    const transform = outputScale.scaled ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0] : null;
                    return {
                        ctx,
                        canvas,
                        transform
                    };
                }

                _convertCanvasToImage(canvas) {
                    if (this.renderingState !== _ui_utils.RenderingStates.FINISHED) {
                        throw new Error("_convertCanvasToImage: Rendering has not finished.");
                    }
                    const reducedCanvas = this._reduceImage(canvas);
                    const image = document.createElement("img");
                    image.className = "thumbnailImage";
                    this._thumbPageCanvas.then(msg => {
                        image.setAttribute("aria-label", msg);
                    });
                    image.src = reducedCanvas.toDataURL();
                    this.image = image;
                    this.div.setAttribute("data-loaded", true);
                    this._placeholderImg.replaceWith(image);
                    reducedCanvas.width = 0;
                    reducedCanvas.height = 0;
                }

                async #finishRenderTask(renderTask, canvas, error = null) {
                    if (renderTask === this.renderTask) {
                        this.renderTask = null;
                    }
                    if (error instanceof _pdfjsLib.RenderingCancelledException) {
                        return;
                    }
                    this.renderingState = _ui_utils.RenderingStates.FINISHED;
                    this._convertCanvasToImage(canvas);
                    if (error) {
                        throw error;
                    }
                }

                async draw() {
                    if (this.renderingState !== _ui_utils.RenderingStates.INITIAL) {
                        console.error("Must be in new state before drawing");
                        return undefined;
                    }
                    const {
                        pdfPage
                    } = this;
                    if (!pdfPage) {
                        this.renderingState = _ui_utils.RenderingStates.FINISHED;
                        throw new Error("pdfPage is not loaded");
                    }
                    this.renderingState = _ui_utils.RenderingStates.RUNNING;
                    const {
                        ctx,
                        canvas,
                        transform
                    } = this._getPageDrawContext(DRAW_UPSCALE_FACTOR);
                    const drawViewport = this.viewport.clone({
                        scale: DRAW_UPSCALE_FACTOR * this.scale
                    });
                    const renderContinueCallback = cont => {
                        if (!this.renderingQueue.isHighestPriority(this)) {
                            this.renderingState = _ui_utils.RenderingStates.PAUSED;
                            this.resume = () => {
                                this.renderingState = _ui_utils.RenderingStates.RUNNING;
                                cont();
                            };
                            return;
                        }
                        cont();
                    };
                    const renderContext = {
                        canvasContext: ctx,
                        transform,
                        viewport: drawViewport,
                        optionalContentConfigPromise: this._optionalContentConfigPromise,
                        pageColors: this.pageColors
                    };
                    const renderTask = this.renderTask = pdfPage.render(renderContext);
                    renderTask.onContinue = renderContinueCallback;
                    const resultPromise = renderTask.promise.then(() => this.#finishRenderTask(renderTask, canvas), error => this.#finishRenderTask(renderTask, canvas, error));
                    resultPromise.finally(() => {
                        canvas.width = 0;
                        canvas.height = 0;
                        this.eventBus.dispatch("thumbnailrendered", {
                            source: this,
                            pageNumber: this.id,
                            pdfPage: this.pdfPage
                        });
                    });
                    return resultPromise;
                }

                setImage(pageView) {
                    if (this.renderingState !== _ui_utils.RenderingStates.INITIAL) {
                        return;
                    }
                    const {
                        thumbnailCanvas: canvas,
                        pdfPage,
                        scale
                    } = pageView;
                    if (!canvas) {
                        return;
                    }
                    if (!this.pdfPage) {
                        this.setPdfPage(pdfPage);
                    }
                    if (scale < this.scale) {
                        return;
                    }
                    this.renderingState = _ui_utils.RenderingStates.FINISHED;
                    this._convertCanvasToImage(canvas);
                }

                _reduceImage(img) {
                    const {
                        ctx,
                        canvas
                    } = this._getPageDrawContext();
                    if (img.width <= 2 * canvas.width) {
                        ctx.drawImage(img, 0, 0, img.width, img.height, 0, 0, canvas.width, canvas.height);
                        return canvas;
                    }
                    let reducedWidth = canvas.width << MAX_NUM_SCALING_STEPS;
                    let reducedHeight = canvas.height << MAX_NUM_SCALING_STEPS;
                    const [reducedImage, reducedImageCtx] = TempImageFactory.getCanvas(reducedWidth, reducedHeight);
                    while (reducedWidth > img.width || reducedHeight > img.height) {
                        reducedWidth >>= 1;
                        reducedHeight >>= 1;
                    }
                    reducedImageCtx.drawImage(img, 0, 0, img.width, img.height, 0, 0, reducedWidth, reducedHeight);
                    while (reducedWidth > 2 * canvas.width) {
                        reducedImageCtx.drawImage(reducedImage, 0, 0, reducedWidth, reducedHeight, 0, 0, reducedWidth >> 1, reducedHeight >> 1);
                        reducedWidth >>= 1;
                        reducedHeight >>= 1;
                    }
                    ctx.drawImage(reducedImage, 0, 0, reducedWidth, reducedHeight, 0, 0, canvas.width, canvas.height);
                    return canvas;
                }

                get _thumbPageTitle() {
                    return this.l10n.get("thumb_page_title", {
                        page: this.pageLabel ?? this.id
                    });
                }

                get _thumbPageCanvas() {
                    return this.l10n.get("thumb_page_canvas", {
                        page: this.pageLabel ?? this.id
                    });
                }

                setPageLabel(label) {
                    this.pageLabel = typeof label === "string" ? label : null;
                    this._thumbPageTitle.then(msg => {
                        this.anchor.title = msg;
                    });
                    if (this.renderingState !== _ui_utils.RenderingStates.FINISHED) {
                        return;
                    }
                    this._thumbPageCanvas.then(msg => {
                        this.image?.setAttribute("aria-label", msg);
                    });
                }
            }

            exports.PDFThumbnailView = PDFThumbnailView;

            /***/
        }),
        /* 29 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PagesCountLimit = exports.PDFViewer = exports.PDFPageViewBuffer = void 0;
            var _pdfjsLib = __webpack_require__(4);
            var _ui_utils = __webpack_require__(3);
            var _l10n_utils = __webpack_require__(30);
            var _pdf_page_view = __webpack_require__(31);
            var _pdf_rendering_queue = __webpack_require__(24);
            var _pdf_link_service = __webpack_require__(7);
            const DEFAULT_CACHE_SIZE = 10;
            const PagesCountLimit = {
                FORCE_SCROLL_MODE_PAGE: 15000,
                FORCE_LAZY_PAGE_INIT: 7500,
                PAUSE_EAGER_PAGE_INIT: 250
            };
            exports.PagesCountLimit = PagesCountLimit;

            function isValidAnnotationEditorMode(mode) {
                return Object.values(_pdfjsLib.AnnotationEditorType).includes(mode) && mode !== _pdfjsLib.AnnotationEditorType.DISABLE;
            }

            class PDFPageViewBuffer {
                #buf = new Set();
                #size = 0;

                constructor(size) {
                    this.#size = size;
                }

                push(view) {
                    const buf = this.#buf;
                    if (buf.has(view)) {
                        buf.delete(view);
                    }
                    buf.add(view);
                    if (buf.size > this.#size) {
                        this.#destroyFirstView();
                    }
                }

                resize(newSize, idsToKeep = null) {
                    this.#size = newSize;
                    const buf = this.#buf;
                    if (idsToKeep) {
                        const ii = buf.size;
                        let i = 1;
                        for (const view of buf) {
                            if (idsToKeep.has(view.id)) {
                                buf.delete(view);
                                buf.add(view);
                            }
                            if (++i > ii) {
                                break;
                            }
                        }
                    }
                    while (buf.size > this.#size) {
                        this.#destroyFirstView();
                    }
                }

                has(view) {
                    return this.#buf.has(view);
                }

                [Symbol.iterator]() {
                    return this.#buf.keys();
                }

                #destroyFirstView() {
                    const firstView = this.#buf.keys().next().value;
                    firstView?.destroy();
                    this.#buf.delete(firstView);
                }
            }

            exports.PDFPageViewBuffer = PDFPageViewBuffer;

            class PDFViewer {
                #buffer = null;
                #altTextManager = null;
                #annotationEditorMode = _pdfjsLib.AnnotationEditorType.NONE;
                #annotationEditorUIManager = null;
                #annotationMode = _pdfjsLib.AnnotationMode.ENABLE_FORMS;
                #containerTopLeft = null;
                #copyCallbackBound = null;
                #enablePermissions = false;
                #getAllTextInProgress = false;
                #hiddenCopyElement = null;
                #interruptCopyCondition = false;
                #previousContainerHeight = 0;
                #resizeObserver = new ResizeObserver(this.#resizeObserverCallback.bind(this));
                #scrollModePageState = null;
                #onVisibilityChange = null;
                #scaleTimeoutId = null;
                #textLayerMode = _ui_utils.TextLayerMode.ENABLE;

                constructor(options) {
                    const viewerVersion = '3.11.174';
                    if (_pdfjsLib.version !== viewerVersion) {
                        throw new Error(`The API version "${_pdfjsLib.version}" does not match the Viewer version "${viewerVersion}".`);
                    }
                    this.container = options.container;
                    this.viewer = options.viewer || options.container.firstElementChild;
                    if (this.container?.tagName !== "DIV" || this.viewer?.tagName !== "DIV") {
                        throw new Error("Invalid `container` and/or `viewer` option.");
                    }
                    if (this.container.offsetParent && getComputedStyle(this.container).position !== "absolute") {
                        throw new Error("The `container` must be absolutely positioned.");
                    }
                    this.#resizeObserver.observe(this.container);
                    this.eventBus = options.eventBus;
                    this.linkService = options.linkService || new _pdf_link_service.SimpleLinkService();
                    this.downloadManager = options.downloadManager || null;
                    this.findController = options.findController || null;
                    this.#altTextManager = options.altTextManager || null;
                    if (this.findController) {
                        this.findController.onIsPageVisible = pageNumber => this._getVisiblePages().ids.has(pageNumber);
                    }
                    this._scriptingManager = options.scriptingManager || null;
                    this.#textLayerMode = options.textLayerMode ?? _ui_utils.TextLayerMode.ENABLE;
                    this.#annotationMode = options.annotationMode ?? _pdfjsLib.AnnotationMode.ENABLE_FORMS;
                    this.#annotationEditorMode = options.annotationEditorMode ?? _pdfjsLib.AnnotationEditorType.NONE;
                    this.imageResourcesPath = options.imageResourcesPath || "";
                    this.enablePrintAutoRotate = options.enablePrintAutoRotate || false;
                    this.removePageBorders = options.removePageBorders || false;
                    if (options.useOnlyCssZoom) {
                        console.error("useOnlyCssZoom was removed, please use `maxCanvasPixels = 0` instead.");
                        options.maxCanvasPixels = 0;
                    }
                    this.isOffscreenCanvasSupported = options.isOffscreenCanvasSupported ?? true;
                    this.maxCanvasPixels = options.maxCanvasPixels;
                    this.l10n = options.l10n || _l10n_utils.NullL10n;
                    this.#enablePermissions = options.enablePermissions || false;
                    this.pageColors = options.pageColors || null;
                    this.defaultRenderingQueue = !options.renderingQueue;
                    if (this.defaultRenderingQueue) {
                        this.renderingQueue = new _pdf_rendering_queue.PDFRenderingQueue();
                        this.renderingQueue.setViewer(this);
                    } else {
                        this.renderingQueue = options.renderingQueue;
                    }
                    this.scroll = (0, _ui_utils.watchScroll)(this.container, this._scrollUpdate.bind(this));
                    this.presentationModeState = _ui_utils.PresentationModeState.UNKNOWN;
                    this._onBeforeDraw = this._onAfterDraw = null;
                    this._resetView();
                    if (this.removePageBorders) {
                        this.viewer.classList.add("removePageBorders");
                    }
                    this.#updateContainerHeightCss();
                    this.eventBus._on("thumbnailrendered", ({
                                                                pageNumber,
                                                                pdfPage
                                                            }) => {
                        const pageView = this._pages[pageNumber - 1];
                        if (!this.#buffer.has(pageView)) {
                            pdfPage?.cleanup();
                        }
                    });
                }

                get pagesCount() {
                    return this._pages.length;
                }

                getPageView(index) {
                    return this._pages[index];
                }

                getCachedPageViews() {
                    return new Set(this.#buffer);
                }

                get pageViewsReady() {
                    return this._pagesCapability.settled && this._pages.every(pageView => pageView?.pdfPage);
                }

                get renderForms() {
                    return this.#annotationMode === _pdfjsLib.AnnotationMode.ENABLE_FORMS;
                }

                get enableScripting() {
                    return !!this._scriptingManager;
                }

                get currentPageNumber() {
                    return this._currentPageNumber;
                }

                set currentPageNumber(val) {
                    if (!Number.isInteger(val)) {
                        throw new Error("Invalid page number.");
                    }
                    if (!this.pdfDocument) {
                        return;
                    }
                    if (!this._setCurrentPageNumber(val, true)) {
                        console.error(`currentPageNumber: "${val}" is not a valid page.`);
                    }
                }

                _setCurrentPageNumber(val, resetCurrentPageView = false) {
                    if (this._currentPageNumber === val) {
                        if (resetCurrentPageView) {
                            this.#resetCurrentPageView();
                        }
                        return true;
                    }
                    if (!(0 < val && val <= this.pagesCount)) {
                        return false;
                    }
                    const previous = this._currentPageNumber;
                    this._currentPageNumber = val;
                    this.eventBus.dispatch("pagechanging", {
                        source: this,
                        pageNumber: val,
                        pageLabel: this._pageLabels?.[val - 1] ?? null,
                        previous
                    });
                    if (resetCurrentPageView) {
                        this.#resetCurrentPageView();
                    }
                    return true;
                }

                get currentPageLabel() {
                    return this._pageLabels?.[this._currentPageNumber - 1] ?? null;
                }

                set currentPageLabel(val) {
                    if (!this.pdfDocument) {
                        return;
                    }
                    let page = val | 0;
                    if (this._pageLabels) {
                        const i = this._pageLabels.indexOf(val);
                        if (i >= 0) {
                            page = i + 1;
                        }
                    }
                    if (!this._setCurrentPageNumber(page, true)) {
                        console.error(`currentPageLabel: "${val}" is not a valid page.`);
                    }
                }

                get currentScale() {
                    return this._currentScale !== _ui_utils.UNKNOWN_SCALE ? this._currentScale : _ui_utils.DEFAULT_SCALE;
                }

                set currentScale(val) {
                    if (isNaN(val)) {
                        throw new Error("Invalid numeric scale.");
                    }
                    if (!this.pdfDocument) {
                        return;
                    }
                    this.#setScale(val, {
                        noScroll: false
                    });
                }

                get currentScaleValue() {
                    return this._currentScaleValue;
                }

                set currentScaleValue(val) {
                    if (!this.pdfDocument) {
                        return;
                    }
                    this.#setScale(val, {
                        noScroll: false
                    });
                }

                get pagesRotation() {
                    return this._pagesRotation;
                }

                set pagesRotation(rotation) {
                    if (!(0, _ui_utils.isValidRotation)(rotation)) {
                        throw new Error("Invalid pages rotation angle.");
                    }
                    if (!this.pdfDocument) {
                        return;
                    }
                    rotation %= 360;
                    if (rotation < 0) {
                        rotation += 360;
                    }
                    if (this._pagesRotation === rotation) {
                        return;
                    }
                    this._pagesRotation = rotation;
                    const pageNumber = this._currentPageNumber;
                    this.refresh(true, {
                        rotation
                    });
                    if (this._currentScaleValue) {
                        this.#setScale(this._currentScaleValue, {
                            noScroll: true
                        });
                    }
                    this.eventBus.dispatch("rotationchanging", {
                        source: this,
                        pagesRotation: rotation,
                        pageNumber
                    });
                    if (this.defaultRenderingQueue) {
                        this.update();
                    }
                }

                get firstPagePromise() {
                    return this.pdfDocument ? this._firstPageCapability.promise : null;
                }

                get onePageRendered() {
                    return this.pdfDocument ? this._onePageRenderedCapability.promise : null;
                }

                get pagesPromise() {
                    return this.pdfDocument ? this._pagesCapability.promise : null;
                }

                #layerProperties() {
                    const self = this;
                    return {
                        get annotationEditorUIManager() {
                            return self.#annotationEditorUIManager;
                        },
                        get annotationStorage() {
                            return self.pdfDocument?.annotationStorage;
                        },
                        get downloadManager() {
                            return self.downloadManager;
                        },
                        get enableScripting() {
                            return !!self._scriptingManager;
                        },
                        get fieldObjectsPromise() {
                            return self.pdfDocument?.getFieldObjects();
                        },
                        get findController() {
                            return self.findController;
                        },
                        get hasJSActionsPromise() {
                            return self.pdfDocument?.hasJSActions();
                        },
                        get linkService() {
                            return self.linkService;
                        }
                    };
                }

                #initializePermissions(permissions) {
                    const params = {
                        annotationEditorMode: this.#annotationEditorMode,
                        annotationMode: this.#annotationMode,
                        textLayerMode: this.#textLayerMode
                    };
                    if (!permissions) {
                        return params;
                    }
                    if (!permissions.includes(_pdfjsLib.PermissionFlag.COPY) && this.#textLayerMode === _ui_utils.TextLayerMode.ENABLE) {
                        params.textLayerMode = _ui_utils.TextLayerMode.ENABLE_PERMISSIONS;
                    }
                    if (!permissions.includes(_pdfjsLib.PermissionFlag.MODIFY_CONTENTS)) {
                        params.annotationEditorMode = _pdfjsLib.AnnotationEditorType.DISABLE;
                    }
                    if (!permissions.includes(_pdfjsLib.PermissionFlag.MODIFY_ANNOTATIONS) && !permissions.includes(_pdfjsLib.PermissionFlag.FILL_INTERACTIVE_FORMS) && this.#annotationMode === _pdfjsLib.AnnotationMode.ENABLE_FORMS) {
                        params.annotationMode = _pdfjsLib.AnnotationMode.ENABLE;
                    }
                    return params;
                }

                #onePageRenderedOrForceFetch() {
                    if (document.visibilityState === "hidden" || !this.container.offsetParent || this._getVisiblePages().views.length === 0) {
                        return Promise.resolve();
                    }
                    const visibilityChangePromise = new Promise(resolve => {
                        this.#onVisibilityChange = () => {
                            if (document.visibilityState !== "hidden") {
                                return;
                            }
                            resolve();
                            document.removeEventListener("visibilitychange", this.#onVisibilityChange);
                            this.#onVisibilityChange = null;
                        };
                        document.addEventListener("visibilitychange", this.#onVisibilityChange);
                    });
                    return Promise.race([this._onePageRenderedCapability.promise, visibilityChangePromise]);
                }

                async getAllText() {
                    const texts = [];
                    const buffer = [];
                    for (let pageNum = 1, pagesCount = this.pdfDocument.numPages; pageNum <= pagesCount; ++pageNum) {
                        if (this.#interruptCopyCondition) {
                            return null;
                        }
                        buffer.length = 0;
                        const page = await this.pdfDocument.getPage(pageNum);
                        const {
                            items
                        } = await page.getTextContent();
                        for (const item of items) {
                            if (item.str) {
                                buffer.push(item.str);
                            }
                            if (item.hasEOL) {
                                buffer.push("\n");
                            }
                        }
                        texts.push((0, _ui_utils.removeNullCharacters)(buffer.join("")));
                    }
                    return texts.join("\n");
                }

                #copyCallback(textLayerMode, event) {
                    const selection = document.getSelection();
                    const {
                        focusNode,
                        anchorNode
                    } = selection;
                    if (anchorNode && focusNode && selection.containsNode(this.#hiddenCopyElement)) {
                        if (this.#getAllTextInProgress || textLayerMode === _ui_utils.TextLayerMode.ENABLE_PERMISSIONS) {
                            event.preventDefault();
                            event.stopPropagation();
                            return;
                        }
                        this.#getAllTextInProgress = true;
                        const savedCursor = this.container.style.cursor;
                        this.container.style.cursor = "wait";
                        const interruptCopy = ev => this.#interruptCopyCondition = ev.key === "Escape";
                        window.addEventListener("keydown", interruptCopy);
                        this.getAllText().then(async text => {
                            if (text !== null) {
                                await navigator.clipboard.writeText(text);
                            }
                        }).catch(reason => {
                            console.warn(`Something goes wrong when extracting the text: ${reason.message}`);
                        }).finally(() => {
                            this.#getAllTextInProgress = false;
                            this.#interruptCopyCondition = false;
                            window.removeEventListener("keydown", interruptCopy);
                            this.container.style.cursor = savedCursor;
                        });
                        event.preventDefault();
                        event.stopPropagation();
                    }
                }

                setDocument(pdfDocument) {
                    if (this.pdfDocument) {
                        this.eventBus.dispatch("pagesdestroy", {
                            source: this
                        });
                        this._cancelRendering();
                        this._resetView();
                        this.findController?.setDocument(null);
                        this._scriptingManager?.setDocument(null);
                        if (this.#annotationEditorUIManager) {
                            this.#annotationEditorUIManager.destroy();
                            this.#annotationEditorUIManager = null;
                        }
                    }
                    this.pdfDocument = pdfDocument;
                    if (!pdfDocument) {
                        return;
                    }
                    const pagesCount = pdfDocument.numPages;
                    const firstPagePromise = pdfDocument.getPage(1);
                    const optionalContentConfigPromise = pdfDocument.getOptionalContentConfig();
                    const permissionsPromise = this.#enablePermissions ? pdfDocument.getPermissions() : Promise.resolve();
                    if (pagesCount > PagesCountLimit.FORCE_SCROLL_MODE_PAGE) {
                        console.warn("Forcing PAGE-scrolling for performance reasons, given the length of the document.");
                        const mode = this._scrollMode = _ui_utils.ScrollMode.PAGE;
                        this.eventBus.dispatch("scrollmodechanged", {
                            source: this,
                            mode
                        });
                    }
                    this._pagesCapability.promise.then(() => {
                        this.eventBus.dispatch("pagesloaded", {
                            source: this,
                            pagesCount
                        });
                    }, () => {
                    });
                    this._onBeforeDraw = evt => {
                        const pageView = this._pages[evt.pageNumber - 1];
                        if (!pageView) {
                            return;
                        }
                        this.#buffer.push(pageView);
                    };
                    this.eventBus._on("pagerender", this._onBeforeDraw);
                    this._onAfterDraw = evt => {
                        if (evt.cssTransform || this._onePageRenderedCapability.settled) {
                            return;
                        }
                        this._onePageRenderedCapability.resolve({
                            timestamp: evt.timestamp
                        });
                        this.eventBus._off("pagerendered", this._onAfterDraw);
                        this._onAfterDraw = null;
                        if (this.#onVisibilityChange) {
                            document.removeEventListener("visibilitychange", this.#onVisibilityChange);
                            this.#onVisibilityChange = null;
                        }
                    };
                    this.eventBus._on("pagerendered", this._onAfterDraw);
                    Promise.all([firstPagePromise, permissionsPromise]).then(([firstPdfPage, permissions]) => {
                        if (pdfDocument !== this.pdfDocument) {
                            return;
                        }
                        this._firstPageCapability.resolve(firstPdfPage);
                        this._optionalContentConfigPromise = optionalContentConfigPromise;
                        const {
                            annotationEditorMode,
                            annotationMode,
                            textLayerMode
                        } = this.#initializePermissions(permissions);
                        if (textLayerMode !== _ui_utils.TextLayerMode.DISABLE) {
                            const element = this.#hiddenCopyElement = document.createElement("div");
                            element.id = "hiddenCopyElement";
                            this.viewer.before(element);
                        }
                        if (annotationEditorMode !== _pdfjsLib.AnnotationEditorType.DISABLE) {
                            const mode = annotationEditorMode;
                            if (pdfDocument.isPureXfa) {
                                console.warn("Warning: XFA-editing is not implemented.");
                            } else if (isValidAnnotationEditorMode(mode)) {
                                this.#annotationEditorUIManager = new _pdfjsLib.AnnotationEditorUIManager(this.container, this.viewer, this.#altTextManager, this.eventBus, pdfDocument, this.pageColors);
                                if (mode !== _pdfjsLib.AnnotationEditorType.NONE) {
                                    this.#annotationEditorUIManager.updateMode(mode);
                                }
                            } else {
                                console.error(`Invalid AnnotationEditor mode: ${mode}`);
                            }
                        }
                        const layerProperties = this.#layerProperties.bind(this);
                        const viewerElement = this._scrollMode === _ui_utils.ScrollMode.PAGE ? null : this.viewer;
                        const scale = this.currentScale;
                        const viewport = firstPdfPage.getViewport({
                            scale: scale * _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS
                        });
                        this.viewer.style.setProperty("--scale-factor", viewport.scale);
                        if (this.pageColors?.foreground === "CanvasText" || this.pageColors?.background === "Canvas") {
                            this.viewer.style.setProperty("--hcm-highligh-filter", pdfDocument.filterFactory.addHighlightHCMFilter("CanvasText", "Canvas", "HighlightText", "Highlight"));
                        }
                        for (let pageNum = 1; pageNum <= pagesCount; ++pageNum) {
                            const pageView = new _pdf_page_view.PDFPageView({
                                container: viewerElement,
                                eventBus: this.eventBus,
                                id: pageNum,
                                scale,
                                defaultViewport: viewport.clone(),
                                optionalContentConfigPromise,
                                renderingQueue: this.renderingQueue,
                                textLayerMode,
                                annotationMode,
                                imageResourcesPath: this.imageResourcesPath,
                                isOffscreenCanvasSupported: this.isOffscreenCanvasSupported,
                                maxCanvasPixels: this.maxCanvasPixels,
                                pageColors: this.pageColors,
                                l10n: this.l10n,
                                layerProperties
                            });
                            this._pages.push(pageView);
                        }
                        const firstPageView = this._pages[0];
                        if (firstPageView) {
                            firstPageView.setPdfPage(firstPdfPage);
                            this.linkService.cachePageRef(1, firstPdfPage.ref);
                        }
                        if (this._scrollMode === _ui_utils.ScrollMode.PAGE) {
                            this.#ensurePageViewVisible();
                        } else if (this._spreadMode !== _ui_utils.SpreadMode.NONE) {
                            this._updateSpreadMode();
                        }
                        this.#onePageRenderedOrForceFetch().then(async () => {
                            this.findController?.setDocument(pdfDocument);
                            this._scriptingManager?.setDocument(pdfDocument);
                            if (this.#hiddenCopyElement) {
                                this.#copyCallbackBound = this.#copyCallback.bind(this, textLayerMode);
                                document.addEventListener("copy", this.#copyCallbackBound);
                            }
                            if (this.#annotationEditorUIManager) {
                                this.eventBus.dispatch("annotationeditormodechanged", {
                                    source: this,
                                    mode: this.#annotationEditorMode
                                });
                            }
                            if (pdfDocument.loadingParams.disableAutoFetch || pagesCount > PagesCountLimit.FORCE_LAZY_PAGE_INIT) {
                                this._pagesCapability.resolve();
                                return;
                            }
                            let getPagesLeft = pagesCount - 1;
                            if (getPagesLeft <= 0) {
                                this._pagesCapability.resolve();
                                return;
                            }
                            for (let pageNum = 2; pageNum <= pagesCount; ++pageNum) {
                                const promise = pdfDocument.getPage(pageNum).then(pdfPage => {
                                    const pageView = this._pages[pageNum - 1];
                                    if (!pageView.pdfPage) {
                                        pageView.setPdfPage(pdfPage);
                                    }
                                    this.linkService.cachePageRef(pageNum, pdfPage.ref);
                                    if (--getPagesLeft === 0) {
                                        this._pagesCapability.resolve();
                                    }
                                }, reason => {
                                    console.error(`Unable to get page ${pageNum} to initialize viewer`, reason);
                                    if (--getPagesLeft === 0) {
                                        this._pagesCapability.resolve();
                                    }
                                });
                                if (pageNum % PagesCountLimit.PAUSE_EAGER_PAGE_INIT === 0) {
                                    await promise;
                                }
                            }
                        });
                        this.eventBus.dispatch("pagesinit", {
                            source: this
                        });
                        pdfDocument.getMetadata().then(({
                                                            info
                                                        }) => {
                            if (pdfDocument !== this.pdfDocument) {
                                return;
                            }
                            if (info.Language) {
                                this.viewer.lang = info.Language;
                            }
                        });
                        if (this.defaultRenderingQueue) {
                            this.update();
                        }
                    }).catch(reason => {
                        console.error("Unable to initialize viewer", reason);
                        this._pagesCapability.reject(reason);
                    });
                }

                setPageLabels(labels) {
                    if (!this.pdfDocument) {
                        return;
                    }
                    if (!labels) {
                        this._pageLabels = null;
                    } else if (!(Array.isArray(labels) && this.pdfDocument.numPages === labels.length)) {
                        this._pageLabels = null;
                        console.error(`setPageLabels: Invalid page labels.`);
                    } else {
                        this._pageLabels = labels;
                    }
                    for (let i = 0, ii = this._pages.length; i < ii; i++) {
                        this._pages[i].setPageLabel(this._pageLabels?.[i] ?? null);
                    }
                }

                _resetView() {
                    this._pages = [];
                    this._currentPageNumber = 1;
                    this._currentScale = _ui_utils.UNKNOWN_SCALE;
                    this._currentScaleValue = null;
                    this._pageLabels = null;
                    this.#buffer = new PDFPageViewBuffer(DEFAULT_CACHE_SIZE);
                    this._location = null;
                    this._pagesRotation = 0;
                    this._optionalContentConfigPromise = null;
                    this._firstPageCapability = new _pdfjsLib.PromiseCapability();
                    this._onePageRenderedCapability = new _pdfjsLib.PromiseCapability();
                    this._pagesCapability = new _pdfjsLib.PromiseCapability();
                    this._scrollMode = _ui_utils.ScrollMode.VERTICAL;
                    this._previousScrollMode = _ui_utils.ScrollMode.UNKNOWN;
                    this._spreadMode = _ui_utils.SpreadMode.NONE;
                    this.#scrollModePageState = {
                        previousPageNumber: 1,
                        scrollDown: true,
                        pages: []
                    };
                    if (this._onBeforeDraw) {
                        this.eventBus._off("pagerender", this._onBeforeDraw);
                        this._onBeforeDraw = null;
                    }
                    if (this._onAfterDraw) {
                        this.eventBus._off("pagerendered", this._onAfterDraw);
                        this._onAfterDraw = null;
                    }
                    if (this.#onVisibilityChange) {
                        document.removeEventListener("visibilitychange", this.#onVisibilityChange);
                        this.#onVisibilityChange = null;
                    }
                    this.viewer.textContent = "";
                    this._updateScrollMode();
                    this.viewer.removeAttribute("lang");
                    if (this.#hiddenCopyElement) {
                        document.removeEventListener("copy", this.#copyCallbackBound);
                        this.#copyCallbackBound = null;
                        this.#hiddenCopyElement.remove();
                        this.#hiddenCopyElement = null;
                    }
                }

                #ensurePageViewVisible() {
                    if (this._scrollMode !== _ui_utils.ScrollMode.PAGE) {
                        throw new Error("#ensurePageViewVisible: Invalid scrollMode value.");
                    }
                    const pageNumber = this._currentPageNumber,
                        state = this.#scrollModePageState,
                        viewer = this.viewer;
                    viewer.textContent = "";
                    state.pages.length = 0;
                    if (this._spreadMode === _ui_utils.SpreadMode.NONE && !this.isInPresentationMode) {
                        const pageView = this._pages[pageNumber - 1];
                        viewer.append(pageView.div);
                        state.pages.push(pageView);
                    } else {
                        const pageIndexSet = new Set(),
                            parity = this._spreadMode - 1;
                        if (parity === -1) {
                            pageIndexSet.add(pageNumber - 1);
                        } else if (pageNumber % 2 !== parity) {
                            pageIndexSet.add(pageNumber - 1);
                            pageIndexSet.add(pageNumber);
                        } else {
                            pageIndexSet.add(pageNumber - 2);
                            pageIndexSet.add(pageNumber - 1);
                        }
                        const spread = document.createElement("div");
                        spread.className = "spread";
                        if (this.isInPresentationMode) {
                            const dummyPage = document.createElement("div");
                            dummyPage.className = "dummyPage";
                            spread.append(dummyPage);
                        }
                        for (const i of pageIndexSet) {
                            const pageView = this._pages[i];
                            if (!pageView) {
                                continue;
                            }
                            spread.append(pageView.div);
                            state.pages.push(pageView);
                        }
                        viewer.append(spread);
                    }
                    state.scrollDown = pageNumber >= state.previousPageNumber;
                    state.previousPageNumber = pageNumber;
                }

                _scrollUpdate() {
                    if (this.pagesCount === 0) {
                        return;
                    }
                    this.update();
                }

                #scrollIntoView(pageView, pageSpot = null) {
                    const {
                        div,
                        id
                    } = pageView;
                    if (this._currentPageNumber !== id) {
                        this._setCurrentPageNumber(id);
                    }
                    if (this._scrollMode === _ui_utils.ScrollMode.PAGE) {
                        this.#ensurePageViewVisible();
                        this.update();
                    }
                    if (!pageSpot && !this.isInPresentationMode) {
                        const left = div.offsetLeft + div.clientLeft,
                            right = left + div.clientWidth;
                        const {
                            scrollLeft,
                            clientWidth
                        } = this.container;
                        if (this._scrollMode === _ui_utils.ScrollMode.HORIZONTAL || left < scrollLeft || right > scrollLeft + clientWidth) {
                            pageSpot = {
                                left: 0,
                                top: 0
                            };
                        }
                    }
                    (0, _ui_utils.scrollIntoView)(div, pageSpot);
                    if (!this._currentScaleValue && this._location) {
                        this._location = null;
                    }
                }

                #isSameScale(newScale) {
                    return newScale === this._currentScale || Math.abs(newScale - this._currentScale) < 1e-15;
                }

                #setScaleUpdatePages(newScale, newValue, {
                    noScroll = false,
                    preset = false,
                    drawingDelay = -1
                }) {
                    this._currentScaleValue = newValue.toString();
                    if (this.#isSameScale(newScale)) {
                        if (preset) {
                            this.eventBus.dispatch("scalechanging", {
                                source: this,
                                scale: newScale,
                                presetValue: newValue
                            });
                        }
                        return;
                    }
                    this.viewer.style.setProperty("--scale-factor", newScale * _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS);
                    const postponeDrawing = drawingDelay >= 0 && drawingDelay < 1000;
                    this.refresh(true, {
                        scale: newScale,
                        drawingDelay: postponeDrawing ? drawingDelay : -1
                    });
                    if (postponeDrawing) {
                        this.#scaleTimeoutId = setTimeout(() => {
                            this.#scaleTimeoutId = null;
                            this.refresh();
                        }, drawingDelay);
                    }
                    this._currentScale = newScale;
                    if (!noScroll) {
                        let page = this._currentPageNumber,
                            dest;
                        if (this._location && !(this.isInPresentationMode || this.isChangingPresentationMode)) {
                            page = this._location.pageNumber;
                            dest = [null, {
                                name: "XYZ"
                            }, this._location.left, this._location.top, null];
                        }
                        this.scrollPageIntoView({
                            pageNumber: page,
                            destArray: dest,
                            allowNegativeOffset: true
                        });
                    }
                    this.eventBus.dispatch("scalechanging", {
                        source: this,
                        scale: newScale,
                        presetValue: preset ? newValue : undefined
                    });
                    if (this.defaultRenderingQueue) {
                        this.update();
                    }
                }

                get #pageWidthScaleFactor() {
                    if (this._spreadMode !== _ui_utils.SpreadMode.NONE && this._scrollMode !== _ui_utils.ScrollMode.HORIZONTAL) {
                        return 2;
                    }
                    return 1;
                }

                #setScale(value, options) {
                    let scale = parseFloat(value);
                    if (scale > 0) {
                        options.preset = false;
                        this.#setScaleUpdatePages(scale, value, options);
                    } else {
                        const currentPage = this._pages[this._currentPageNumber - 1];
                        if (!currentPage) {
                            return;
                        }
                        let hPadding = _ui_utils.SCROLLBAR_PADDING,
                            vPadding = _ui_utils.VERTICAL_PADDING;
                        if (this.isInPresentationMode) {
                            hPadding = vPadding = 4;
                            if (this._spreadMode !== _ui_utils.SpreadMode.NONE) {
                                hPadding *= 2;
                            }
                        } else if (this.removePageBorders) {
                            hPadding = vPadding = 0;
                        } else if (this._scrollMode === _ui_utils.ScrollMode.HORIZONTAL) {
                            [hPadding, vPadding] = [vPadding, hPadding];
                        }
                        const pageWidthScale = (this.container.clientWidth - hPadding) / currentPage.width * currentPage.scale / this.#pageWidthScaleFactor;
                        const pageHeightScale = (this.container.clientHeight - vPadding) / currentPage.height * currentPage.scale;
                        switch (value) {
                            case "page-actual":
                                scale = 1;
                                break;
                            case "page-width":
                                scale = pageWidthScale;
                                break;
                            case "page-height":
                                scale = pageHeightScale;
                                break;
                            case "page-fit":
                                scale = Math.min(pageWidthScale, pageHeightScale);
                                break;
                            case "auto":
                                const horizontalScale = (0, _ui_utils.isPortraitOrientation)(currentPage) ? pageWidthScale : Math.min(pageHeightScale, pageWidthScale);
                                scale = Math.min(_ui_utils.MAX_AUTO_SCALE, horizontalScale);
                                break;
                            default:
                                console.error(`#setScale: "${value}" is an unknown zoom value.`);
                                return;
                        }
                        options.preset = true;
                        this.#setScaleUpdatePages(scale, value, options);
                    }
                }

                #resetCurrentPageView() {
                    const pageView = this._pages[this._currentPageNumber - 1];
                    if (this.isInPresentationMode) {
                        this.#setScale(this._currentScaleValue, {
                            noScroll: true
                        });
                    }
                    this.#scrollIntoView(pageView);
                }

                pageLabelToPageNumber(label) {
                    if (!this._pageLabels) {
                        return null;
                    }
                    const i = this._pageLabels.indexOf(label);
                    if (i < 0) {
                        return null;
                    }
                    return i + 1;
                }

                scrollPageIntoView({
                                       pageNumber,
                                       destArray = null,
                                       allowNegativeOffset = false,
                                       ignoreDestinationZoom = false
                                   }) {
                    if (!this.pdfDocument) {
                        return;
                    }
                    const pageView = Number.isInteger(pageNumber) && this._pages[pageNumber - 1];
                    if (!pageView) {
                        console.error(`scrollPageIntoView: "${pageNumber}" is not a valid pageNumber parameter.`);
                        return;
                    }
                    if (this.isInPresentationMode || !destArray) {
                        this._setCurrentPageNumber(pageNumber, true);
                        return;
                    }
                    let x = 0,
                        y = 0;
                    let width = 0,
                        height = 0,
                        widthScale,
                        heightScale;
                    const changeOrientation = pageView.rotation % 180 !== 0;
                    const pageWidth = (changeOrientation ? pageView.height : pageView.width) / pageView.scale / _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS;
                    const pageHeight = (changeOrientation ? pageView.width : pageView.height) / pageView.scale / _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS;
                    let scale = 0;
                    switch (destArray[1].name) {
                        case "XYZ":
                            x = destArray[2];
                            y = destArray[3];
                            scale = destArray[4];
                            x = x !== null ? x : 0;
                            y = y !== null ? y : pageHeight;
                            break;
                        case "Fit":
                        case "FitB":
                            scale = "page-fit";
                            break;
                        case "FitH":
                        case "FitBH":
                            y = destArray[2];
                            scale = "page-width";
                            if (y === null && this._location) {
                                x = this._location.left;
                                y = this._location.top;
                            } else if (typeof y !== "number" || y < 0) {
                                y = pageHeight;
                            }
                            break;
                        case "FitV":
                        case "FitBV":
                            x = destArray[2];
                            width = pageWidth;
                            height = pageHeight;
                            scale = "page-height";
                            break;
                        case "FitR":
                            x = destArray[2];
                            y = destArray[3];
                            width = destArray[4] - x;
                            height = destArray[5] - y;
                            let hPadding = _ui_utils.SCROLLBAR_PADDING,
                                vPadding = _ui_utils.VERTICAL_PADDING;
                            if (this.removePageBorders) {
                                hPadding = vPadding = 0;
                            }
                            widthScale = (this.container.clientWidth - hPadding) / width / _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS;
                            heightScale = (this.container.clientHeight - vPadding) / height / _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS;
                            scale = Math.min(Math.abs(widthScale), Math.abs(heightScale));
                            break;
                        default:
                            console.error(`scrollPageIntoView: "${destArray[1].name}" is not a valid destination type.`);
                            return;
                    }
                    if (!ignoreDestinationZoom) {
                        if (scale && scale !== this._currentScale) {
                            this.currentScaleValue = scale;
                        } else if (this._currentScale === _ui_utils.UNKNOWN_SCALE) {
                            this.currentScaleValue = _ui_utils.DEFAULT_SCALE_VALUE;
                        }
                    }
                    if (scale === "page-fit" && !destArray[4]) {
                        this.#scrollIntoView(pageView);
                        return;
                    }
                    const boundingRect = [pageView.viewport.convertToViewportPoint(x, y), pageView.viewport.convertToViewportPoint(x + width, y + height)];
                    let left = Math.min(boundingRect[0][0], boundingRect[1][0]);
                    let top = Math.min(boundingRect[0][1], boundingRect[1][1]);
                    if (!allowNegativeOffset) {
                        left = Math.max(left, 0);
                        top = Math.max(top, 0);
                    }
                    this.#scrollIntoView(pageView, {
                        left,
                        top
                    });
                }

                _updateLocation(firstPage) {
                    const currentScale = this._currentScale;
                    const currentScaleValue = this._currentScaleValue;
                    const normalizedScaleValue = parseFloat(currentScaleValue) === currentScale ? Math.round(currentScale * 10000) / 100 : currentScaleValue;
                    const pageNumber = firstPage.id;
                    const currentPageView = this._pages[pageNumber - 1];
                    const container = this.container;
                    const topLeft = currentPageView.getPagePoint(container.scrollLeft - firstPage.x, container.scrollTop - firstPage.y);
                    const intLeft = Math.round(topLeft[0]);
                    const intTop = Math.round(topLeft[1]);
                    let pdfOpenParams = `#page=${pageNumber}`;
                    if (!this.isInPresentationMode) {
                        pdfOpenParams += `&zoom=${normalizedScaleValue},${intLeft},${intTop}`;
                    }
                    this._location = {
                        pageNumber,
                        scale: normalizedScaleValue,
                        top: intTop,
                        left: intLeft,
                        rotation: this._pagesRotation,
                        pdfOpenParams
                    };
                }

                update() {
                    const visible = this._getVisiblePages();
                    const visiblePages = visible.views,
                        numVisiblePages = visiblePages.length;
                    if (numVisiblePages === 0) {
                        return;
                    }
                    const newCacheSize = Math.max(DEFAULT_CACHE_SIZE, 2 * numVisiblePages + 1);
                    this.#buffer.resize(newCacheSize, visible.ids);
                    this.renderingQueue.renderHighestPriority(visible);
                    const isSimpleLayout = this._spreadMode === _ui_utils.SpreadMode.NONE && (this._scrollMode === _ui_utils.ScrollMode.PAGE || this._scrollMode === _ui_utils.ScrollMode.VERTICAL);
                    const currentId = this._currentPageNumber;
                    let stillFullyVisible = false;
                    for (const page of visiblePages) {
                        if (page.percent < 100) {
                            break;
                        }
                        if (page.id === currentId && isSimpleLayout) {
                            stillFullyVisible = true;
                            break;
                        }
                    }
                    this._setCurrentPageNumber(stillFullyVisible ? currentId : visiblePages[0].id);
                    this._updateLocation(visible.first);
                    this.eventBus.dispatch("updateviewarea", {
                        source: this,
                        location: this._location
                    });
                }

                containsElement(element) {
                    return this.container.contains(element);
                }

                focus() {
                    this.container.focus();
                }

                get _isContainerRtl() {
                    return getComputedStyle(this.container).direction === "rtl";
                }

                get isInPresentationMode() {
                    return this.presentationModeState === _ui_utils.PresentationModeState.FULLSCREEN;
                }

                get isChangingPresentationMode() {
                    return this.presentationModeState === _ui_utils.PresentationModeState.CHANGING;
                }

                get isHorizontalScrollbarEnabled() {
                    return this.isInPresentationMode ? false : this.container.scrollWidth > this.container.clientWidth;
                }

                get isVerticalScrollbarEnabled() {
                    return this.isInPresentationMode ? false : this.container.scrollHeight > this.container.clientHeight;
                }

                _getVisiblePages() {
                    const views = this._scrollMode === _ui_utils.ScrollMode.PAGE ? this.#scrollModePageState.pages : this._pages,
                        horizontal = this._scrollMode === _ui_utils.ScrollMode.HORIZONTAL,
                        rtl = horizontal && this._isContainerRtl;
                    return (0, _ui_utils.getVisibleElements)({
                        scrollEl: this.container,
                        views,
                        sortByVisibility: true,
                        horizontal,
                        rtl
                    });
                }

                cleanup() {
                    for (const pageView of this._pages) {
                        if (pageView.renderingState !== _ui_utils.RenderingStates.FINISHED) {
                            pageView.reset();
                        }
                    }
                }

                _cancelRendering() {
                    for (const pageView of this._pages) {
                        pageView.cancelRendering();
                    }
                }

                async #ensurePdfPageLoaded(pageView) {
                    if (pageView.pdfPage) {
                        return pageView.pdfPage;
                    }
                    try {
                        const pdfPage = await this.pdfDocument.getPage(pageView.id);
                        if (!pageView.pdfPage) {
                            pageView.setPdfPage(pdfPage);
                        }
                        if (!this.linkService._cachedPageNumber?.(pdfPage.ref)) {
                            this.linkService.cachePageRef(pageView.id, pdfPage.ref);
                        }
                        return pdfPage;
                    } catch (reason) {
                        console.error("Unable to get page for page view", reason);
                        return null;
                    }
                }

                #getScrollAhead(visible) {
                    if (visible.first?.id === 1) {
                        return true;
                    } else if (visible.last?.id === this.pagesCount) {
                        return false;
                    }
                    switch (this._scrollMode) {
                        case _ui_utils.ScrollMode.PAGE:
                            return this.#scrollModePageState.scrollDown;
                        case _ui_utils.ScrollMode.HORIZONTAL:
                            return this.scroll.right;
                    }
                    return this.scroll.down;
                }

                forceRendering(currentlyVisiblePages) {
                    const visiblePages = currentlyVisiblePages || this._getVisiblePages();
                    const scrollAhead = this.#getScrollAhead(visiblePages);
                    const preRenderExtra = this._spreadMode !== _ui_utils.SpreadMode.NONE && this._scrollMode !== _ui_utils.ScrollMode.HORIZONTAL;
                    const pageView = this.renderingQueue.getHighestPriority(visiblePages, this._pages, scrollAhead, preRenderExtra);
                    if (pageView) {
                        this.#ensurePdfPageLoaded(pageView).then(() => {
                            this.renderingQueue.renderView(pageView);
                        });
                        return true;
                    }
                    return false;
                }

                get hasEqualPageSizes() {
                    const firstPageView = this._pages[0];
                    for (let i = 1, ii = this._pages.length; i < ii; ++i) {
                        const pageView = this._pages[i];
                        if (pageView.width !== firstPageView.width || pageView.height !== firstPageView.height) {
                            return false;
                        }
                    }
                    return true;
                }

                getPagesOverview() {
                    let initialOrientation;
                    return this._pages.map(pageView => {
                        const viewport = pageView.pdfPage.getViewport({
                            scale: 1
                        });
                        const orientation = (0, _ui_utils.isPortraitOrientation)(viewport);
                        if (initialOrientation === undefined) {
                            initialOrientation = orientation;
                        } else if (this.enablePrintAutoRotate && orientation !== initialOrientation) {
                            return {
                                width: viewport.height,
                                height: viewport.width,
                                rotation: (viewport.rotation - 90) % 360
                            };
                        }
                        return {
                            width: viewport.width,
                            height: viewport.height,
                            rotation: viewport.rotation
                        };
                    });
                }

                get optionalContentConfigPromise() {
                    if (!this.pdfDocument) {
                        return Promise.resolve(null);
                    }
                    if (!this._optionalContentConfigPromise) {
                        console.error("optionalContentConfigPromise: Not initialized yet.");
                        return this.pdfDocument.getOptionalContentConfig();
                    }
                    return this._optionalContentConfigPromise;
                }

                set optionalContentConfigPromise(promise) {
                    if (!(promise instanceof Promise)) {
                        throw new Error(`Invalid optionalContentConfigPromise: ${promise}`);
                    }
                    if (!this.pdfDocument) {
                        return;
                    }
                    if (!this._optionalContentConfigPromise) {
                        return;
                    }
                    this._optionalContentConfigPromise = promise;
                    this.refresh(false, {
                        optionalContentConfigPromise: promise
                    });
                    this.eventBus.dispatch("optionalcontentconfigchanged", {
                        source: this,
                        promise
                    });
                }

                get scrollMode() {
                    return this._scrollMode;
                }

                set scrollMode(mode) {
                    if (this._scrollMode === mode) {
                        return;
                    }
                    if (!(0, _ui_utils.isValidScrollMode)(mode)) {
                        throw new Error(`Invalid scroll mode: ${mode}`);
                    }
                    if (this.pagesCount > PagesCountLimit.FORCE_SCROLL_MODE_PAGE) {
                        return;
                    }
                    this._previousScrollMode = this._scrollMode;
                    this._scrollMode = mode;
                    this.eventBus.dispatch("scrollmodechanged", {
                        source: this,
                        mode
                    });
                    this._updateScrollMode(this._currentPageNumber);
                }

                _updateScrollMode(pageNumber = null) {
                    const scrollMode = this._scrollMode,
                        viewer = this.viewer;
                    viewer.classList.toggle("scrollHorizontal", scrollMode === _ui_utils.ScrollMode.HORIZONTAL);
                    viewer.classList.toggle("scrollWrapped", scrollMode === _ui_utils.ScrollMode.WRAPPED);
                    if (!this.pdfDocument || !pageNumber) {
                        return;
                    }
                    if (scrollMode === _ui_utils.ScrollMode.PAGE) {
                        this.#ensurePageViewVisible();
                    } else if (this._previousScrollMode === _ui_utils.ScrollMode.PAGE) {
                        this._updateSpreadMode();
                    }
                    if (this._currentScaleValue && isNaN(this._currentScaleValue)) {
                        this.#setScale(this._currentScaleValue, {
                            noScroll: true
                        });
                    }
                    this._setCurrentPageNumber(pageNumber, true);
                    this.update();
                }

                get spreadMode() {
                    return this._spreadMode;
                }

                set spreadMode(mode) {
                    if (this._spreadMode === mode) {
                        return;
                    }
                    if (!(0, _ui_utils.isValidSpreadMode)(mode)) {
                        throw new Error(`Invalid spread mode: ${mode}`);
                    }
                    this._spreadMode = mode;
                    this.eventBus.dispatch("spreadmodechanged", {
                        source: this,
                        mode
                    });
                    this._updateSpreadMode(this._currentPageNumber);
                }

                _updateSpreadMode(pageNumber = null) {
                    if (!this.pdfDocument) {
                        return;
                    }
                    const viewer = this.viewer,
                        pages = this._pages;
                    if (this._scrollMode === _ui_utils.ScrollMode.PAGE) {
                        this.#ensurePageViewVisible();
                    } else {
                        viewer.textContent = "";
                        if (this._spreadMode === _ui_utils.SpreadMode.NONE) {
                            for (const pageView of this._pages) {
                                viewer.append(pageView.div);
                            }
                        } else {
                            const parity = this._spreadMode - 1;
                            let spread = null;
                            for (let i = 0, ii = pages.length; i < ii; ++i) {
                                if (spread === null) {
                                    spread = document.createElement("div");
                                    spread.className = "spread";
                                    viewer.append(spread);
                                } else if (i % 2 === parity) {
                                    spread = spread.cloneNode(false);
                                    viewer.append(spread);
                                }
                                spread.append(pages[i].div);
                            }
                        }
                    }
                    if (!pageNumber) {
                        return;
                    }
                    if (this._currentScaleValue && isNaN(this._currentScaleValue)) {
                        this.#setScale(this._currentScaleValue, {
                            noScroll: true
                        });
                    }
                    this._setCurrentPageNumber(pageNumber, true);
                    this.update();
                }

                _getPageAdvance(currentPageNumber, previous = false) {
                    switch (this._scrollMode) {
                        case _ui_utils.ScrollMode.WRAPPED: {
                            const {
                                    views
                                } = this._getVisiblePages(),
                                pageLayout = new Map();
                            for (const {
                                id,
                                y,
                                percent,
                                widthPercent
                            } of views) {
                                if (percent === 0 || widthPercent < 100) {
                                    continue;
                                }
                                let yArray = pageLayout.get(y);
                                if (!yArray) {
                                    pageLayout.set(y, yArray ||= []);
                                }
                                yArray.push(id);
                            }
                            for (const yArray of pageLayout.values()) {
                                const currentIndex = yArray.indexOf(currentPageNumber);
                                if (currentIndex === -1) {
                                    continue;
                                }
                                const numPages = yArray.length;
                                if (numPages === 1) {
                                    break;
                                }
                                if (previous) {
                                    for (let i = currentIndex - 1, ii = 0; i >= ii; i--) {
                                        const currentId = yArray[i],
                                            expectedId = yArray[i + 1] - 1;
                                        if (currentId < expectedId) {
                                            return currentPageNumber - expectedId;
                                        }
                                    }
                                } else {
                                    for (let i = currentIndex + 1, ii = numPages; i < ii; i++) {
                                        const currentId = yArray[i],
                                            expectedId = yArray[i - 1] + 1;
                                        if (currentId > expectedId) {
                                            return expectedId - currentPageNumber;
                                        }
                                    }
                                }
                                if (previous) {
                                    const firstId = yArray[0];
                                    if (firstId < currentPageNumber) {
                                        return currentPageNumber - firstId + 1;
                                    }
                                } else {
                                    const lastId = yArray[numPages - 1];
                                    if (lastId > currentPageNumber) {
                                        return lastId - currentPageNumber + 1;
                                    }
                                }
                                break;
                            }
                            break;
                        }
                        case _ui_utils.ScrollMode.HORIZONTAL: {
                            break;
                        }
                        case _ui_utils.ScrollMode.PAGE:
                        case _ui_utils.ScrollMode.VERTICAL: {
                            if (this._spreadMode === _ui_utils.SpreadMode.NONE) {
                                break;
                            }
                            const parity = this._spreadMode - 1;
                            if (previous && currentPageNumber % 2 !== parity) {
                                break;
                            } else if (!previous && currentPageNumber % 2 === parity) {
                                break;
                            }
                            const {
                                    views
                                } = this._getVisiblePages(),
                                expectedId = previous ? currentPageNumber - 1 : currentPageNumber + 1;
                            for (const {
                                id,
                                percent,
                                widthPercent
                            } of views) {
                                if (id !== expectedId) {
                                    continue;
                                }
                                if (percent > 0 && widthPercent === 100) {
                                    return 2;
                                }
                                break;
                            }
                            break;
                        }
                    }
                    return 1;
                }

                nextPage() {
                    const currentPageNumber = this._currentPageNumber,
                        pagesCount = this.pagesCount;
                    if (currentPageNumber >= pagesCount) {
                        return false;
                    }
                    const advance = this._getPageAdvance(currentPageNumber, false) || 1;
                    this.currentPageNumber = Math.min(currentPageNumber + advance, pagesCount);
                    return true;
                }

                previousPage() {
                    const currentPageNumber = this._currentPageNumber;
                    if (currentPageNumber <= 1) {
                        return false;
                    }
                    const advance = this._getPageAdvance(currentPageNumber, true) || 1;
                    this.currentPageNumber = Math.max(currentPageNumber - advance, 1);
                    return true;
                }

                increaseScale({
                                  drawingDelay,
                                  scaleFactor,
                                  steps
                              } = {}) {
                    if (!this.pdfDocument) {
                        return;
                    }
                    let newScale = this._currentScale;
                    if (scaleFactor > 1) {
                        newScale = Math.round(newScale * scaleFactor * 100) / 100;
                    } else {
                        steps ??= 1;
                        do {
                            newScale = Math.ceil((newScale * _ui_utils.DEFAULT_SCALE_DELTA).toFixed(2) * 10) / 10;
                        } while (--steps > 0 && newScale < _ui_utils.MAX_SCALE);
                    }
                    this.#setScale(Math.min(_ui_utils.MAX_SCALE, newScale), {
                        noScroll: false,
                        drawingDelay
                    });
                }

                decreaseScale({
                                  drawingDelay,
                                  scaleFactor,
                                  steps
                              } = {}) {
                    if (!this.pdfDocument) {
                        return;
                    }
                    let newScale = this._currentScale;
                    if (scaleFactor > 0 && scaleFactor < 1) {
                        newScale = Math.round(newScale * scaleFactor * 100) / 100;
                    } else {
                        steps ??= 1;
                        do {
                            newScale = Math.floor((newScale / _ui_utils.DEFAULT_SCALE_DELTA).toFixed(2) * 10) / 10;
                        } while (--steps > 0 && newScale > _ui_utils.MIN_SCALE);
                    }
                    this.#setScale(Math.max(_ui_utils.MIN_SCALE, newScale), {
                        noScroll: false,
                        drawingDelay
                    });
                }

                #updateContainerHeightCss(height = this.container.clientHeight) {
                    if (height !== this.#previousContainerHeight) {
                        this.#previousContainerHeight = height;
                        _ui_utils.docStyle.setProperty("--viewer-container-height", `${height}px`);
                    }
                }

                #resizeObserverCallback(entries) {
                    for (const entry of entries) {
                        if (entry.target === this.container) {
                            this.#updateContainerHeightCss(Math.floor(entry.borderBoxSize[0].blockSize));
                            this.#containerTopLeft = null;
                            break;
                        }
                    }
                }

                get containerTopLeft() {
                    return this.#containerTopLeft ||= [this.container.offsetTop, this.container.offsetLeft];
                }

                get annotationEditorMode() {
                    return this.#annotationEditorUIManager ? this.#annotationEditorMode : _pdfjsLib.AnnotationEditorType.DISABLE;
                }

                set annotationEditorMode({
                                             mode,
                                             editId = null
                                         }) {
                    if (!this.#annotationEditorUIManager) {
                        throw new Error(`The AnnotationEditor is not enabled.`);
                    }
                    if (this.#annotationEditorMode === mode) {
                        return;
                    }
                    if (!isValidAnnotationEditorMode(mode)) {
                        throw new Error(`Invalid AnnotationEditor mode: ${mode}`);
                    }
                    if (!this.pdfDocument) {
                        return;
                    }
                    this.#annotationEditorMode = mode;
                    this.eventBus.dispatch("annotationeditormodechanged", {
                        source: this,
                        mode
                    });
                    this.#annotationEditorUIManager.updateMode(mode, editId);
                }

                set annotationEditorParams({
                                               type,
                                               value
                                           }) {
                    if (!this.#annotationEditorUIManager) {
                        throw new Error(`The AnnotationEditor is not enabled.`);
                    }
                    this.#annotationEditorUIManager.updateParams(type, value);
                }

                refresh(noUpdate = false, updateArgs = Object.create(null)) {
                    if (!this.pdfDocument) {
                        return;
                    }
                    for (const pageView of this._pages) {
                        pageView.update(updateArgs);
                    }
                    if (this.#scaleTimeoutId !== null) {
                        clearTimeout(this.#scaleTimeoutId);
                        this.#scaleTimeoutId = null;
                    }
                    if (!noUpdate) {
                        this.update();
                    }
                }
            }

            exports.PDFViewer = PDFViewer;

            /***/
        }),
        /* 30 */
        /***/ ((__unused_webpack_module, exports) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.NullL10n = void 0;
            exports.getL10nFallback = getL10nFallback;
            const DEFAULT_L10N_STRINGS = {
                of_pages: "of {{pagesCount}}",
                page_of_pages: "({{pageNumber}} of {{pagesCount}})",
                document_properties_kb: "{{size_kb}} KB ({{size_b}} bytes)",
                document_properties_mb: "{{size_mb}} MB ({{size_b}} bytes)",
                document_properties_date_string: "{{date}}, {{time}}",
                document_properties_page_size_unit_inches: "in",
                document_properties_page_size_unit_millimeters: "mm",
                document_properties_page_size_orientation_portrait: "portrait",
                document_properties_page_size_orientation_landscape: "landscape",
                document_properties_page_size_name_a3: "A3",
                document_properties_page_size_name_a4: "A4",
                document_properties_page_size_name_letter: "Letter",
                document_properties_page_size_name_legal: "Legal",
                document_properties_page_size_dimension_string: "{{width}} × {{height}} {{unit}} ({{orientation}})",
                document_properties_page_size_dimension_name_string: "{{width}} × {{height}} {{unit}} ({{name}}, {{orientation}})",
                document_properties_linearized_yes: "Yes",
                document_properties_linearized_no: "No",
                additional_layers: "Additional Layers",
                page_landmark: "Page {{page}}",
                thumb_page_title: "Page {{page}}",
                thumb_page_canvas: "Thumbnail of Page {{page}}",
                find_reached_top: "Reached top of document, continued from bottom",
                find_reached_bottom: "Reached end of document, continued from top",
                "find_match_count[one]": "{{current}} of {{total}} match",
                "find_match_count[other]": "{{current}} of {{total}} matches",
                "find_match_count_limit[one]": "More than {{limit}} match",
                "find_match_count_limit[other]": "More than {{limit}} matches",
                find_not_found: "Phrase not found",
                page_scale_width: "Page Width",
                page_scale_fit: "Page Fit",
                page_scale_auto: "Automatic Zoom",
                page_scale_actual: "Actual Size",
                page_scale_percent: "{{scale}}%",
                loading_error: "An error occurred while loading the PDF.",
                invalid_file_error: "Invalid or corrupted PDF file.",
                missing_file_error: "Missing PDF file.",
                unexpected_response_error: "Unexpected server response.",
                rendering_error: "An error occurred while rendering the page.",
                annotation_date_string: "{{date}}, {{time}}",
                printing_not_supported: "Warning: Printing is not fully supported by this browser.",
                printing_not_ready: "Warning: The PDF is not fully loaded for printing.",
                web_fonts_disabled: "Web fonts are disabled: unable to use embedded PDF fonts.",
                free_text2_default_content: "Start typing…",
                editor_free_text2_aria_label: "Text Editor",
                editor_ink2_aria_label: "Draw Editor",
                editor_ink_canvas_aria_label: "User-created image",
                editor_alt_text_button_label: "Alt text",
                editor_alt_text_edit_button_label: "Edit alt text",
                editor_alt_text_decorative_tooltip: "Marked as decorative"
            };
            {
                DEFAULT_L10N_STRINGS.print_progress_percent = "{{progress}}%";
            }

            function getL10nFallback(key, args) {
                switch (key) {
                    case "find_match_count":
                        key = `find_match_count[${args.total === 1 ? "one" : "other"}]`;
                        break;
                    case "find_match_count_limit":
                        key = `find_match_count_limit[${args.limit === 1 ? "one" : "other"}]`;
                        break;
                }
                return DEFAULT_L10N_STRINGS[key] || "";
            }

            function formatL10nValue(text, args) {
                if (!args) {
                    return text;
                }
                return text.replaceAll(/\{\{\s*(\w+)\s*\}\}/g, (all, name) => {
                    return name in args ? args[name] : "{{" + name + "}}";
                });
            }

            const NullL10n = {
                async getLanguage() {
                    return "en-us";
                },
                async getDirection() {
                    return "ltr";
                },
                async get(key, args = null, fallback = getL10nFallback(key, args)) {
                    return formatL10nValue(fallback, args);
                },
                async translate(element) {
                }
            };
            exports.NullL10n = NullL10n;

            /***/
        }),
        /* 31 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PDFPageView = void 0;
            var _pdfjsLib = __webpack_require__(4);
            var _ui_utils = __webpack_require__(3);
            var _annotation_editor_layer_builder = __webpack_require__(32);
            var _annotation_layer_builder = __webpack_require__(33);
            var _app_options = __webpack_require__(5);
            var _l10n_utils = __webpack_require__(30);
            var _pdf_link_service = __webpack_require__(7);
            var _struct_tree_layer_builder = __webpack_require__(34);
            var _text_accessibility = __webpack_require__(35);
            var _text_highlighter = __webpack_require__(36);
            var _text_layer_builder = __webpack_require__(37);
            var _xfa_layer_builder = __webpack_require__(38);
            const MAX_CANVAS_PIXELS = _app_options.compatibilityParams.maxCanvasPixels || 16777216;
            const DEFAULT_LAYER_PROPERTIES = () => {
                return null;
            };

            class PDFPageView {
                #annotationMode = _pdfjsLib.AnnotationMode.ENABLE_FORMS;
                #hasRestrictedScaling = false;
                #layerProperties = null;
                #loadingId = null;
                #previousRotation = null;
                #renderError = null;
                #renderingState = _ui_utils.RenderingStates.INITIAL;
                #textLayerMode = _ui_utils.TextLayerMode.ENABLE;
                #useThumbnailCanvas = {
                    directDrawing: true,
                    initialOptionalContent: true,
                    regularAnnotations: true
                };
                #viewportMap = new WeakMap();

                constructor(options) {
                    const container = options.container;
                    const defaultViewport = options.defaultViewport;
                    this.id = options.id;
                    this.renderingId = "page" + this.id;
                    this.#layerProperties = options.layerProperties || DEFAULT_LAYER_PROPERTIES;
                    this.pdfPage = null;
                    this.pageLabel = null;
                    this.rotation = 0;
                    this.scale = options.scale || _ui_utils.DEFAULT_SCALE;
                    this.viewport = defaultViewport;
                    this.pdfPageRotate = defaultViewport.rotation;
                    this._optionalContentConfigPromise = options.optionalContentConfigPromise || null;
                    this.#textLayerMode = options.textLayerMode ?? _ui_utils.TextLayerMode.ENABLE;
                    this.#annotationMode = options.annotationMode ?? _pdfjsLib.AnnotationMode.ENABLE_FORMS;
                    this.imageResourcesPath = options.imageResourcesPath || "";
                    this.isOffscreenCanvasSupported = options.isOffscreenCanvasSupported ?? true;
                    this.maxCanvasPixels = options.maxCanvasPixels ?? MAX_CANVAS_PIXELS;
                    this.pageColors = options.pageColors || null;
                    this.eventBus = options.eventBus;
                    this.renderingQueue = options.renderingQueue;
                    this.l10n = options.l10n || _l10n_utils.NullL10n;
                    this.renderTask = null;
                    this.resume = null;
                    this._isStandalone = !this.renderingQueue?.hasViewer();
                    this._container = container;
                    if (options.useOnlyCssZoom) {
                        console.error("useOnlyCssZoom was removed, please use `maxCanvasPixels = 0` instead.");
                        this.maxCanvasPixels = 0;
                    }
                    this._annotationCanvasMap = null;
                    this.annotationLayer = null;
                    this.annotationEditorLayer = null;
                    this.textLayer = null;
                    this.zoomLayer = null;
                    this.xfaLayer = null;
                    this.structTreeLayer = null;
                    const div = document.createElement("div");
                    div.className = "page";
                    div.setAttribute("data-page-number", this.id);
                    div.setAttribute("role", "region");
                    this.l10n.get("page_landmark", {
                        page: this.id
                    }).then(msg => {
                        div.setAttribute("aria-label", msg);
                    });
                    this.div = div;
                    this.#setDimensions();
                    container?.append(div);
                    if (this._isStandalone) {
                        container?.style.setProperty("--scale-factor", this.scale * _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS);
                        const {
                            optionalContentConfigPromise
                        } = options;
                        if (optionalContentConfigPromise) {
                            optionalContentConfigPromise.then(optionalContentConfig => {
                                if (optionalContentConfigPromise !== this._optionalContentConfigPromise) {
                                    return;
                                }
                                this.#useThumbnailCanvas.initialOptionalContent = optionalContentConfig.hasInitialVisibility;
                            });
                        }
                    }
                }

                get renderingState() {
                    return this.#renderingState;
                }

                set renderingState(state) {
                    if (state === this.#renderingState) {
                        return;
                    }
                    this.#renderingState = state;
                    if (this.#loadingId) {
                        clearTimeout(this.#loadingId);
                        this.#loadingId = null;
                    }
                    switch (state) {
                        case _ui_utils.RenderingStates.PAUSED:
                            this.div.classList.remove("loading");
                            break;
                        case _ui_utils.RenderingStates.RUNNING:
                            this.div.classList.add("loadingIcon");
                            this.#loadingId = setTimeout(() => {
                                this.div.classList.add("loading");
                                this.#loadingId = null;
                            }, 0);
                            break;
                        case _ui_utils.RenderingStates.INITIAL:
                        case _ui_utils.RenderingStates.FINISHED:
                            this.div.classList.remove("loadingIcon", "loading");
                            break;
                    }
                }

                #setDimensions() {
                    const {
                        viewport
                    } = this;
                    if (this.pdfPage) {
                        if (this.#previousRotation === viewport.rotation) {
                            return;
                        }
                        this.#previousRotation = viewport.rotation;
                    }
                    (0, _pdfjsLib.setLayerDimensions)(this.div, viewport, true, false);
                }

                setPdfPage(pdfPage) {
                    if (this._isStandalone && (this.pageColors?.foreground === "CanvasText" || this.pageColors?.background === "Canvas")) {
                        this._container?.style.setProperty("--hcm-highligh-filter", pdfPage.filterFactory.addHighlightHCMFilter("CanvasText", "Canvas", "HighlightText", "Highlight"));
                    }
                    this.pdfPage = pdfPage;
                    this.pdfPageRotate = pdfPage.rotate;
                    const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
                    this.viewport = pdfPage.getViewport({
                        scale: this.scale * _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS,
                        rotation: totalRotation
                    });
                    this.#setDimensions();
                    this.reset();
                }

                destroy() {
                    this.reset();
                    this.pdfPage?.cleanup();
                }

                get _textHighlighter() {
                    return (0, _pdfjsLib.shadow)(this, "_textHighlighter", new _text_highlighter.TextHighlighter({
                        pageIndex: this.id - 1,
                        eventBus: this.eventBus,
                        findController: this.#layerProperties().findController
                    }));
                }

                async #renderAnnotationLayer() {
                    let error = null;
                    try {
                        await this.annotationLayer.render(this.viewport, "display");
                    } catch (ex) {
                        console.error(`#renderAnnotationLayer: "${ex}".`);
                        error = ex;
                    } finally {
                        this.eventBus.dispatch("annotationlayerrendered", {
                            source: this,
                            pageNumber: this.id,
                            error
                        });
                    }
                }

                async #renderAnnotationEditorLayer() {
                    let error = null;
                    try {
                        await this.annotationEditorLayer.render(this.viewport, "display");
                    } catch (ex) {
                        console.error(`#renderAnnotationEditorLayer: "${ex}".`);
                        error = ex;
                    } finally {
                        this.eventBus.dispatch("annotationeditorlayerrendered", {
                            source: this,
                            pageNumber: this.id,
                            error
                        });
                    }
                }

                async #renderXfaLayer() {
                    let error = null;
                    try {
                        const result = await this.xfaLayer.render(this.viewport, "display");
                        if (result?.textDivs && this._textHighlighter) {
                            this.#buildXfaTextContentItems(result.textDivs);
                        }
                    } catch (ex) {
                        console.error(`#renderXfaLayer: "${ex}".`);
                        error = ex;
                    } finally {
                        this.eventBus.dispatch("xfalayerrendered", {
                            source: this,
                            pageNumber: this.id,
                            error
                        });
                    }
                }

                async #renderTextLayer() {
                    const {
                        pdfPage,
                        textLayer,
                        viewport
                    } = this;
                    if (!textLayer) {
                        return;
                    }
                    let error = null;
                    try {
                        if (!textLayer.renderingDone) {
                            const readableStream = pdfPage.streamTextContent({
                                includeMarkedContent: true,
                                disableNormalization: true
                            });
                            textLayer.setTextContentSource(readableStream);
                        }
                        await textLayer.render(viewport);
                    } catch (ex) {
                        if (ex instanceof _pdfjsLib.AbortException) {
                            return;
                        }
                        console.error(`#renderTextLayer: "${ex}".`);
                        error = ex;
                    }
                    this.eventBus.dispatch("textlayerrendered", {
                        source: this,
                        pageNumber: this.id,
                        numTextDivs: textLayer.numTextDivs,
                        error
                    });
                    this.#renderStructTreeLayer();
                }

                async #renderStructTreeLayer() {
                    if (!this.textLayer) {
                        return;
                    }
                    this.structTreeLayer ||= new _struct_tree_layer_builder.StructTreeLayerBuilder();
                    const tree = await (!this.structTreeLayer.renderingDone ? this.pdfPage.getStructTree() : null);
                    const treeDom = this.structTreeLayer?.render(tree);
                    if (treeDom) {
                        this.canvas?.append(treeDom);
                    }
                    this.structTreeLayer?.show();
                }

                async #buildXfaTextContentItems(textDivs) {
                    const text = await this.pdfPage.getTextContent();
                    const items = [];
                    for (const item of text.items) {
                        items.push(item.str);
                    }
                    this._textHighlighter.setTextMapping(textDivs, items);
                    this._textHighlighter.enable();
                }

                _resetZoomLayer(removeFromDOM = false) {
                    if (!this.zoomLayer) {
                        return;
                    }
                    const zoomLayerCanvas = this.zoomLayer.firstChild;
                    this.#viewportMap.delete(zoomLayerCanvas);
                    zoomLayerCanvas.width = 0;
                    zoomLayerCanvas.height = 0;
                    if (removeFromDOM) {
                        this.zoomLayer.remove();
                    }
                    this.zoomLayer = null;
                }

                reset({
                          keepZoomLayer = false,
                          keepAnnotationLayer = false,
                          keepAnnotationEditorLayer = false,
                          keepXfaLayer = false,
                          keepTextLayer = false
                      } = {}) {
                    this.cancelRendering({
                        keepAnnotationLayer,
                        keepAnnotationEditorLayer,
                        keepXfaLayer,
                        keepTextLayer
                    });
                    this.renderingState = _ui_utils.RenderingStates.INITIAL;
                    const div = this.div;
                    const childNodes = div.childNodes,
                        zoomLayerNode = keepZoomLayer && this.zoomLayer || null,
                        annotationLayerNode = keepAnnotationLayer && this.annotationLayer?.div || null,
                        annotationEditorLayerNode = keepAnnotationEditorLayer && this.annotationEditorLayer?.div || null,
                        xfaLayerNode = keepXfaLayer && this.xfaLayer?.div || null,
                        textLayerNode = keepTextLayer && this.textLayer?.div || null;
                    for (let i = childNodes.length - 1; i >= 0; i--) {
                        const node = childNodes[i];
                        switch (node) {
                            case zoomLayerNode:
                            case annotationLayerNode:
                            case annotationEditorLayerNode:
                            case xfaLayerNode:
                            case textLayerNode:
                                continue;
                        }
                        node.remove();
                    }
                    div.removeAttribute("data-loaded");
                    if (annotationLayerNode) {
                        this.annotationLayer.hide();
                    }
                    if (annotationEditorLayerNode) {
                        this.annotationEditorLayer.hide();
                    }
                    if (xfaLayerNode) {
                        this.xfaLayer.hide();
                    }
                    if (textLayerNode) {
                        this.textLayer.hide();
                    }
                    this.structTreeLayer?.hide();
                    if (!zoomLayerNode) {
                        if (this.canvas) {
                            this.#viewportMap.delete(this.canvas);
                            this.canvas.width = 0;
                            this.canvas.height = 0;
                            delete this.canvas;
                        }
                        this._resetZoomLayer();
                    }
                }

                update({
                           scale = 0,
                           rotation = null,
                           optionalContentConfigPromise = null,
                           drawingDelay = -1
                       }) {
                    this.scale = scale || this.scale;
                    if (typeof rotation === "number") {
                        this.rotation = rotation;
                    }
                    if (optionalContentConfigPromise instanceof Promise) {
                        this._optionalContentConfigPromise = optionalContentConfigPromise;
                        optionalContentConfigPromise.then(optionalContentConfig => {
                            if (optionalContentConfigPromise !== this._optionalContentConfigPromise) {
                                return;
                            }
                            this.#useThumbnailCanvas.initialOptionalContent = optionalContentConfig.hasInitialVisibility;
                        });
                    }
                    this.#useThumbnailCanvas.directDrawing = true;
                    const totalRotation = (this.rotation + this.pdfPageRotate) % 360;
                    this.viewport = this.viewport.clone({
                        scale: this.scale * _pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS,
                        rotation: totalRotation
                    });
                    this.#setDimensions();
                    if (this._isStandalone) {
                        this._container?.style.setProperty("--scale-factor", this.viewport.scale);
                    }
                    if (this.canvas) {
                        let onlyCssZoom = false;
                        if (this.#hasRestrictedScaling) {
                            if (this.maxCanvasPixels === 0) {
                                onlyCssZoom = true;
                            } else if (this.maxCanvasPixels > 0) {
                                const {
                                    width,
                                    height
                                } = this.viewport;
                                const {
                                    sx,
                                    sy
                                } = this.outputScale;
                                onlyCssZoom = (Math.floor(width) * sx | 0) * (Math.floor(height) * sy | 0) > this.maxCanvasPixels;
                            }
                        }
                        const postponeDrawing = !onlyCssZoom && drawingDelay >= 0 && drawingDelay < 1000;
                        if (postponeDrawing || onlyCssZoom) {
                            if (postponeDrawing && this.renderingState !== _ui_utils.RenderingStates.FINISHED) {
                                this.cancelRendering({
                                    keepZoomLayer: true,
                                    keepAnnotationLayer: true,
                                    keepAnnotationEditorLayer: true,
                                    keepXfaLayer: true,
                                    keepTextLayer: true,
                                    cancelExtraDelay: drawingDelay
                                });
                                this.renderingState = _ui_utils.RenderingStates.FINISHED;
                                this.#useThumbnailCanvas.directDrawing = false;
                            }
                            this.cssTransform({
                                target: this.canvas,
                                redrawAnnotationLayer: true,
                                redrawAnnotationEditorLayer: true,
                                redrawXfaLayer: true,
                                redrawTextLayer: !postponeDrawing,
                                hideTextLayer: postponeDrawing
                            });
                            if (postponeDrawing) {
                                return;
                            }
                            this.eventBus.dispatch("pagerendered", {
                                source: this,
                                pageNumber: this.id,
                                cssTransform: true,
                                timestamp: performance.now(),
                                error: this.#renderError
                            });
                            return;
                        }
                        if (!this.zoomLayer && !this.canvas.hidden) {
                            this.zoomLayer = this.canvas.parentNode;
                            this.zoomLayer.style.position = "absolute";
                        }
                    }
                    if (this.zoomLayer) {
                        this.cssTransform({
                            target: this.zoomLayer.firstChild
                        });
                    }
                    this.reset({
                        keepZoomLayer: true,
                        keepAnnotationLayer: true,
                        keepAnnotationEditorLayer: true,
                        keepXfaLayer: true,
                        keepTextLayer: true
                    });
                }

                cancelRendering({
                                    keepAnnotationLayer = false,
                                    keepAnnotationEditorLayer = false,
                                    keepXfaLayer = false,
                                    keepTextLayer = false,
                                    cancelExtraDelay = 0
                                } = {}) {
                    if (this.renderTask) {
                        this.renderTask.cancel(cancelExtraDelay);
                        this.renderTask = null;
                    }
                    this.resume = null;
                    if (this.textLayer && (!keepTextLayer || !this.textLayer.div)) {
                        this.textLayer.cancel();
                        this.textLayer = null;
                    }
                    if (this.structTreeLayer && !this.textLayer) {
                        this.structTreeLayer = null;
                    }
                    if (this.annotationLayer && (!keepAnnotationLayer || !this.annotationLayer.div)) {
                        this.annotationLayer.cancel();
                        this.annotationLayer = null;
                        this._annotationCanvasMap = null;
                    }
                    if (this.annotationEditorLayer && (!keepAnnotationEditorLayer || !this.annotationEditorLayer.div)) {
                        this.annotationEditorLayer.cancel();
                        this.annotationEditorLayer = null;
                    }
                    if (this.xfaLayer && (!keepXfaLayer || !this.xfaLayer.div)) {
                        this.xfaLayer.cancel();
                        this.xfaLayer = null;
                        this._textHighlighter?.disable();
                    }
                }

                cssTransform({
                                 target,
                                 redrawAnnotationLayer = false,
                                 redrawAnnotationEditorLayer = false,
                                 redrawXfaLayer = false,
                                 redrawTextLayer = false,
                                 hideTextLayer = false
                             }) {
                    if (!target.hasAttribute("zooming")) {
                        target.setAttribute("zooming", true);
                        const {
                            style
                        } = target;
                        style.width = style.height = "";
                    }
                    const originalViewport = this.#viewportMap.get(target);
                    if (this.viewport !== originalViewport) {
                        const relativeRotation = this.viewport.rotation - originalViewport.rotation;
                        const absRotation = Math.abs(relativeRotation);
                        let scaleX = 1,
                            scaleY = 1;
                        if (absRotation === 90 || absRotation === 270) {
                            const {
                                width,
                                height
                            } = this.viewport;
                            scaleX = height / width;
                            scaleY = width / height;
                        }
                        target.style.transform = `rotate(${relativeRotation}deg) scale(${scaleX}, ${scaleY})`;
                    }
                    if (redrawAnnotationLayer && this.annotationLayer) {
                        this.#renderAnnotationLayer();
                    }
                    if (redrawAnnotationEditorLayer && this.annotationEditorLayer) {
                        this.#renderAnnotationEditorLayer();
                    }
                    if (redrawXfaLayer && this.xfaLayer) {
                        this.#renderXfaLayer();
                    }
                    if (this.textLayer) {
                        if (hideTextLayer) {
                            this.textLayer.hide();
                            this.structTreeLayer?.hide();
                        } else if (redrawTextLayer) {
                            this.#renderTextLayer();
                        }
                    }
                }

                get width() {
                    return this.viewport.width;
                }

                get height() {
                    return this.viewport.height;
                }

                getPagePoint(x, y) {
                    return this.viewport.convertToPdfPoint(x, y);
                }

                async #finishRenderTask(renderTask, error = null) {
                    if (renderTask === this.renderTask) {
                        this.renderTask = null;
                    }
                    if (error instanceof _pdfjsLib.RenderingCancelledException) {
                        this.#renderError = null;
                        return;
                    }
                    this.#renderError = error;
                    this.renderingState = _ui_utils.RenderingStates.FINISHED;
                    this._resetZoomLayer(true);
                    this.#useThumbnailCanvas.regularAnnotations = !renderTask.separateAnnots;
                    this.eventBus.dispatch("pagerendered", {
                        source: this,
                        pageNumber: this.id,
                        cssTransform: false,
                        timestamp: performance.now(),
                        error: this.#renderError
                    });
                    if (error) {
                        throw error;
                    }
                }

                async draw() {
                    if (this.renderingState !== _ui_utils.RenderingStates.INITIAL) {
                        console.error("Must be in new state before drawing");
                        this.reset();
                    }
                    const {
                        div,
                        l10n,
                        pageColors,
                        pdfPage,
                        viewport
                    } = this;
                    if (!pdfPage) {
                        this.renderingState = _ui_utils.RenderingStates.FINISHED;
                        throw new Error("pdfPage is not loaded");
                    }
                    this.renderingState = _ui_utils.RenderingStates.RUNNING;
                    const canvasWrapper = document.createElement("div");
                    canvasWrapper.classList.add("canvasWrapper");
                    div.append(canvasWrapper);
                    if (!this.textLayer && this.#textLayerMode !== _ui_utils.TextLayerMode.DISABLE && !pdfPage.isPureXfa) {
                        this._accessibilityManager ||= new _text_accessibility.TextAccessibilityManager();
                        this.textLayer = new _text_layer_builder.TextLayerBuilder({
                            highlighter: this._textHighlighter,
                            accessibilityManager: this._accessibilityManager,
                            isOffscreenCanvasSupported: this.isOffscreenCanvasSupported,
                            enablePermissions: this.#textLayerMode === _ui_utils.TextLayerMode.ENABLE_PERMISSIONS
                        });
                        div.append(this.textLayer.div);
                    }
                    if (!this.annotationLayer && this.#annotationMode !== _pdfjsLib.AnnotationMode.DISABLE) {
                        const {
                            annotationStorage,
                            downloadManager,
                            enableScripting,
                            fieldObjectsPromise,
                            hasJSActionsPromise,
                            linkService
                        } = this.#layerProperties();
                        this._annotationCanvasMap ||= new Map();
                        this.annotationLayer = new _annotation_layer_builder.AnnotationLayerBuilder({
                            pageDiv: div,
                            pdfPage,
                            annotationStorage,
                            imageResourcesPath: this.imageResourcesPath,
                            renderForms: this.#annotationMode === _pdfjsLib.AnnotationMode.ENABLE_FORMS,
                            linkService,
                            downloadManager,
                            l10n,
                            enableScripting,
                            hasJSActionsPromise,
                            fieldObjectsPromise,
                            annotationCanvasMap: this._annotationCanvasMap,
                            accessibilityManager: this._accessibilityManager
                        });
                    }
                    const renderContinueCallback = cont => {
                        showCanvas?.(false);
                        if (this.renderingQueue && !this.renderingQueue.isHighestPriority(this)) {
                            this.renderingState = _ui_utils.RenderingStates.PAUSED;
                            this.resume = () => {
                                this.renderingState = _ui_utils.RenderingStates.RUNNING;
                                cont();
                            };
                            return;
                        }
                        cont();
                    };
                    const {
                        width,
                        height
                    } = viewport;
                    const canvas = document.createElement("canvas");
                    canvas.setAttribute("role", "presentation");
                    canvas.hidden = true;
                    const hasHCM = !!(pageColors?.background && pageColors?.foreground);
                    let showCanvas = isLastShow => {
                        if (!hasHCM || isLastShow) {
                            canvas.hidden = false;
                            showCanvas = null;
                        }
                    };
                    canvasWrapper.append(canvas);
                    this.canvas = canvas;
                    const ctx = canvas.getContext("2d", {
                        alpha: false
                    });
                    const outputScale = this.outputScale = new _ui_utils.OutputScale();
                    if (this.maxCanvasPixels === 0) {
                        const invScale = 1 / this.scale;
                        outputScale.sx *= invScale;
                        outputScale.sy *= invScale;
                        this.#hasRestrictedScaling = true;
                    } else if (this.maxCanvasPixels > 0) {
                        const pixelsInViewport = width * height;
                        const maxScale = Math.sqrt(this.maxCanvasPixels / pixelsInViewport);
                        if (outputScale.sx > maxScale || outputScale.sy > maxScale) {
                            outputScale.sx = maxScale;
                            outputScale.sy = maxScale;
                            this.#hasRestrictedScaling = true;
                        } else {
                            this.#hasRestrictedScaling = false;
                        }
                    }
                    const sfx = (0, _ui_utils.approximateFraction)(outputScale.sx);
                    const sfy = (0, _ui_utils.approximateFraction)(outputScale.sy);
                    canvas.width = (0, _ui_utils.roundToDivide)(width * outputScale.sx, sfx[0]);
                    canvas.height = (0, _ui_utils.roundToDivide)(height * outputScale.sy, sfy[0]);
                    const {
                        style
                    } = canvas;
                    style.width = (0, _ui_utils.roundToDivide)(width, sfx[1]) + "px";
                    style.height = (0, _ui_utils.roundToDivide)(height, sfy[1]) + "px";
                    this.#viewportMap.set(canvas, viewport);
                    const transform = outputScale.scaled ? [outputScale.sx, 0, 0, outputScale.sy, 0, 0] : null;
                    const renderContext = {
                        canvasContext: ctx,
                        transform,
                        viewport,
                        annotationMode: this.#annotationMode,
                        optionalContentConfigPromise: this._optionalContentConfigPromise,
                        annotationCanvasMap: this._annotationCanvasMap,
                        pageColors
                    };
                    const renderTask = this.renderTask = this.pdfPage.render(renderContext);
                    renderTask.onContinue = renderContinueCallback;
                    const resultPromise = renderTask.promise.then(async () => {
                        showCanvas?.(true);
                        await this.#finishRenderTask(renderTask);
                        this.#renderTextLayer();
                        if (this.annotationLayer) {
                            await this.#renderAnnotationLayer();
                        }
                        if (!this.annotationEditorLayer) {
                            const {
                                annotationEditorUIManager
                            } = this.#layerProperties();
                            if (!annotationEditorUIManager) {
                                return;
                            }
                            this.annotationEditorLayer = new _annotation_editor_layer_builder.AnnotationEditorLayerBuilder({
                                uiManager: annotationEditorUIManager,
                                pageDiv: div,
                                pdfPage,
                                l10n,
                                accessibilityManager: this._accessibilityManager,
                                annotationLayer: this.annotationLayer?.annotationLayer
                            });
                        }
                        this.#renderAnnotationEditorLayer();
                    }, error => {
                        if (!(error instanceof _pdfjsLib.RenderingCancelledException)) {
                            showCanvas?.(true);
                        }
                        return this.#finishRenderTask(renderTask, error);
                    });
                    if (pdfPage.isPureXfa) {
                        if (!this.xfaLayer) {
                            const {
                                annotationStorage,
                                linkService
                            } = this.#layerProperties();
                            this.xfaLayer = new _xfa_layer_builder.XfaLayerBuilder({
                                pageDiv: div,
                                pdfPage,
                                annotationStorage,
                                linkService
                            });
                        } else if (this.xfaLayer.div) {
                            div.append(this.xfaLayer.div);
                        }
                        this.#renderXfaLayer();
                    }
                    div.setAttribute("data-loaded", true);
                    this.eventBus.dispatch("pagerender", {
                        source: this,
                        pageNumber: this.id
                    });
                    return resultPromise;
                }

                setPageLabel(label) {
                    this.pageLabel = typeof label === "string" ? label : null;
                    if (this.pageLabel !== null) {
                        this.div.setAttribute("data-page-label", this.pageLabel);
                    } else {
                        this.div.removeAttribute("data-page-label");
                    }
                }

                get thumbnailCanvas() {
                    const {
                        directDrawing,
                        initialOptionalContent,
                        regularAnnotations
                    } = this.#useThumbnailCanvas;
                    return directDrawing && initialOptionalContent && regularAnnotations ? this.canvas : null;
                }
            }

            exports.PDFPageView = PDFPageView;

            /***/
        }),
        /* 32 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.AnnotationEditorLayerBuilder = void 0;
            var _pdfjsLib = __webpack_require__(4);
            var _l10n_utils = __webpack_require__(30);

            class AnnotationEditorLayerBuilder {
                #annotationLayer = null;
                #uiManager;

                constructor(options) {
                    this.pageDiv = options.pageDiv;
                    this.pdfPage = options.pdfPage;
                    this.accessibilityManager = options.accessibilityManager;
                    this.l10n = options.l10n || _l10n_utils.NullL10n;
                    this.annotationEditorLayer = null;
                    this.div = null;
                    this._cancelled = false;
                    this.#uiManager = options.uiManager;
                    this.#annotationLayer = options.annotationLayer || null;
                }

                async render(viewport, intent = "display") {
                    if (intent !== "display") {
                        return;
                    }
                    if (this._cancelled) {
                        return;
                    }
                    const clonedViewport = viewport.clone({
                        dontFlip: true
                    });
                    if (this.div) {
                        this.annotationEditorLayer.update({
                            viewport: clonedViewport
                        });
                        this.show();
                        return;
                    }
                    const div = this.div = document.createElement("div");
                    div.className = "annotationEditorLayer";
                    div.tabIndex = 0;
                    div.hidden = true;
                    div.dir = this.#uiManager.direction;
                    this.pageDiv.append(div);
                    this.annotationEditorLayer = new _pdfjsLib.AnnotationEditorLayer({
                        uiManager: this.#uiManager,
                        div,
                        accessibilityManager: this.accessibilityManager,
                        pageIndex: this.pdfPage.pageNumber - 1,
                        l10n: this.l10n,
                        viewport: clonedViewport,
                        annotationLayer: this.#annotationLayer
                    });
                    const parameters = {
                        viewport: clonedViewport,
                        div,
                        annotations: null,
                        intent
                    };
                    this.annotationEditorLayer.render(parameters);
                    this.show();
                }

                cancel() {
                    this._cancelled = true;
                    if (!this.div) {
                        return;
                    }
                    this.pageDiv = null;
                    this.annotationEditorLayer.destroy();
                    this.div.remove();
                }

                hide() {
                    if (!this.div) {
                        return;
                    }
                    this.div.hidden = true;
                }

                show() {
                    if (!this.div || this.annotationEditorLayer.isEmpty) {
                        return;
                    }
                    this.div.hidden = false;
                }
            }

            exports.AnnotationEditorLayerBuilder = AnnotationEditorLayerBuilder;

            /***/
        }),
        /* 33 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.AnnotationLayerBuilder = void 0;
            var _pdfjsLib = __webpack_require__(4);
            var _l10n_utils = __webpack_require__(30);
            var _ui_utils = __webpack_require__(3);

            class AnnotationLayerBuilder {
                #onPresentationModeChanged = null;

                constructor({
                                pageDiv,
                                pdfPage,
                                linkService,
                                downloadManager,
                                annotationStorage = null,
                                imageResourcesPath = "",
                                renderForms = true,
                                l10n = _l10n_utils.NullL10n,
                                enableScripting = false,
                                hasJSActionsPromise = null,
                                fieldObjectsPromise = null,
                                annotationCanvasMap = null,
                                accessibilityManager = null
                            }) {
                    this.pageDiv = pageDiv;
                    this.pdfPage = pdfPage;
                    this.linkService = linkService;
                    this.downloadManager = downloadManager;
                    this.imageResourcesPath = imageResourcesPath;
                    this.renderForms = renderForms;
                    this.l10n = l10n;
                    this.annotationStorage = annotationStorage;
                    this.enableScripting = enableScripting;
                    this._hasJSActionsPromise = hasJSActionsPromise || Promise.resolve(false);
                    this._fieldObjectsPromise = fieldObjectsPromise || Promise.resolve(null);
                    this._annotationCanvasMap = annotationCanvasMap;
                    this._accessibilityManager = accessibilityManager;
                    this.annotationLayer = null;
                    this.div = null;
                    this._cancelled = false;
                    this._eventBus = linkService.eventBus;
                }

                async render(viewport, intent = "display") {
                    if (this.div) {
                        if (this._cancelled || !this.annotationLayer) {
                            return;
                        }
                        this.annotationLayer.update({
                            viewport: viewport.clone({
                                dontFlip: true
                            })
                        });
                        return;
                    }
                    const [annotations, hasJSActions, fieldObjects] = await Promise.all([this.pdfPage.getAnnotations({
                        intent
                    }), this._hasJSActionsPromise, this._fieldObjectsPromise]);
                    if (this._cancelled) {
                        return;
                    }
                    const div = this.div = document.createElement("div");
                    div.className = "annotationLayer";
                    this.pageDiv.append(div);
                    if (annotations.length === 0) {
                        this.hide();
                        return;
                    }
                    this.annotationLayer = new _pdfjsLib.AnnotationLayer({
                        div,
                        accessibilityManager: this._accessibilityManager,
                        annotationCanvasMap: this._annotationCanvasMap,
                        l10n: this.l10n,
                        page: this.pdfPage,
                        viewport: viewport.clone({
                            dontFlip: true
                        })
                    });
                    await this.annotationLayer.render({
                        annotations,
                        imageResourcesPath: this.imageResourcesPath,
                        renderForms: this.renderForms,
                        linkService: this.linkService,
                        downloadManager: this.downloadManager,
                        annotationStorage: this.annotationStorage,
                        enableScripting: this.enableScripting,
                        hasJSActions,
                        fieldObjects
                    });
                    if (this.linkService.isInPresentationMode) {
                        this.#updatePresentationModeState(_ui_utils.PresentationModeState.FULLSCREEN);
                    }
                    if (!this.#onPresentationModeChanged) {
                        this.#onPresentationModeChanged = evt => {
                            this.#updatePresentationModeState(evt.state);
                        };
                        this._eventBus?._on("presentationmodechanged", this.#onPresentationModeChanged);
                    }
                }

                cancel() {
                    this._cancelled = true;
                    if (this.#onPresentationModeChanged) {
                        this._eventBus?._off("presentationmodechanged", this.#onPresentationModeChanged);
                        this.#onPresentationModeChanged = null;
                    }
                }

                hide() {
                    if (!this.div) {
                        return;
                    }
                    this.div.hidden = true;
                }

                #updatePresentationModeState(state) {
                    if (!this.div) {
                        return;
                    }
                    let disableFormElements = false;
                    switch (state) {
                        case _ui_utils.PresentationModeState.FULLSCREEN:
                            disableFormElements = true;
                            break;
                        case _ui_utils.PresentationModeState.NORMAL:
                            break;
                        default:
                            return;
                    }
                    for (const section of this.div.childNodes) {
                        if (section.hasAttribute("data-internal-link")) {
                            continue;
                        }
                        section.inert = disableFormElements;
                    }
                }
            }

            exports.AnnotationLayerBuilder = AnnotationLayerBuilder;

            /***/
        }),
        /* 34 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.StructTreeLayerBuilder = void 0;
            var _ui_utils = __webpack_require__(3);
            const PDF_ROLE_TO_HTML_ROLE = {
                Document: null,
                DocumentFragment: null,
                Part: "group",
                Sect: "group",
                Div: "group",
                Aside: "note",
                NonStruct: "none",
                P: null,
                H: "heading",
                Title: null,
                FENote: "note",
                Sub: "group",
                Lbl: null,
                Span: null,
                Em: null,
                Strong: null,
                Link: "link",
                Annot: "note",
                Form: "form",
                Ruby: null,
                RB: null,
                RT: null,
                RP: null,
                Warichu: null,
                WT: null,
                WP: null,
                L: "list",
                LI: "listitem",
                LBody: null,
                Table: "table",
                TR: "row",
                TH: "columnheader",
                TD: "cell",
                THead: "columnheader",
                TBody: null,
                TFoot: null,
                Caption: null,
                Figure: "figure",
                Formula: null,
                Artifact: null
            };
            const HEADING_PATTERN = /^H(\d+)$/;

            class StructTreeLayerBuilder {
                #treeDom = undefined;

                get renderingDone() {
                    return this.#treeDom !== undefined;
                }

                render(structTree) {
                    if (this.#treeDom !== undefined) {
                        return this.#treeDom;
                    }
                    const treeDom = this.#walk(structTree);
                    treeDom?.classList.add("structTree");
                    return this.#treeDom = treeDom;
                }

                hide() {
                    if (this.#treeDom && !this.#treeDom.hidden) {
                        this.#treeDom.hidden = true;
                    }
                }

                show() {
                    if (this.#treeDom?.hidden) {
                        this.#treeDom.hidden = false;
                    }
                }

                #setAttributes(structElement, htmlElement) {
                    const {
                        alt,
                        id,
                        lang
                    } = structElement;
                    if (alt !== undefined) {
                        htmlElement.setAttribute("aria-label", (0, _ui_utils.removeNullCharacters)(alt));
                    }
                    if (id !== undefined) {
                        htmlElement.setAttribute("aria-owns", id);
                    }
                    if (lang !== undefined) {
                        htmlElement.setAttribute("lang", (0, _ui_utils.removeNullCharacters)(lang, true));
                    }
                }

                #walk(node) {
                    if (!node) {
                        return null;
                    }
                    const element = document.createElement("span");
                    if ("role" in node) {
                        const {
                            role
                        } = node;
                        const match = role.match(HEADING_PATTERN);
                        if (match) {
                            element.setAttribute("role", "heading");
                            element.setAttribute("aria-level", match[1]);
                        } else if (PDF_ROLE_TO_HTML_ROLE[role]) {
                            element.setAttribute("role", PDF_ROLE_TO_HTML_ROLE[role]);
                        }
                    }
                    this.#setAttributes(node, element);
                    if (node.children) {
                        if (node.children.length === 1 && "id" in node.children[0]) {
                            this.#setAttributes(node.children[0], element);
                        } else {
                            for (const kid of node.children) {
                                element.append(this.#walk(kid));
                            }
                        }
                    }
                    return element;
                }
            }

            exports.StructTreeLayerBuilder = StructTreeLayerBuilder;

            /***/
        }),
        /* 35 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.TextAccessibilityManager = void 0;
            var _ui_utils = __webpack_require__(3);

            class TextAccessibilityManager {
                #enabled = false;
                #textChildren = null;
                #textNodes = new Map();
                #waitingElements = new Map();

                setTextMapping(textDivs) {
                    this.#textChildren = textDivs;
                }

                static #compareElementPositions(e1, e2) {
                    const rect1 = e1.getBoundingClientRect();
                    const rect2 = e2.getBoundingClientRect();
                    if (rect1.width === 0 && rect1.height === 0) {
                        return +1;
                    }
                    if (rect2.width === 0 && rect2.height === 0) {
                        return -1;
                    }
                    const top1 = rect1.y;
                    const bot1 = rect1.y + rect1.height;
                    const mid1 = rect1.y + rect1.height / 2;
                    const top2 = rect2.y;
                    const bot2 = rect2.y + rect2.height;
                    const mid2 = rect2.y + rect2.height / 2;
                    if (mid1 <= top2 && mid2 >= bot1) {
                        return -1;
                    }
                    if (mid2 <= top1 && mid1 >= bot2) {
                        return +1;
                    }
                    const centerX1 = rect1.x + rect1.width / 2;
                    const centerX2 = rect2.x + rect2.width / 2;
                    return centerX1 - centerX2;
                }

                enable() {
                    if (this.#enabled) {
                        throw new Error("TextAccessibilityManager is already enabled.");
                    }
                    if (!this.#textChildren) {
                        throw new Error("Text divs and strings have not been set.");
                    }
                    this.#enabled = true;
                    this.#textChildren = this.#textChildren.slice();
                    this.#textChildren.sort(TextAccessibilityManager.#compareElementPositions);
                    if (this.#textNodes.size > 0) {
                        const textChildren = this.#textChildren;
                        for (const [id, nodeIndex] of this.#textNodes) {
                            const element = document.getElementById(id);
                            if (!element) {
                                this.#textNodes.delete(id);
                                continue;
                            }
                            this.#addIdToAriaOwns(id, textChildren[nodeIndex]);
                        }
                    }
                    for (const [element, isRemovable] of this.#waitingElements) {
                        this.addPointerInTextLayer(element, isRemovable);
                    }
                    this.#waitingElements.clear();
                }

                disable() {
                    if (!this.#enabled) {
                        return;
                    }
                    this.#waitingElements.clear();
                    this.#textChildren = null;
                    this.#enabled = false;
                }

                removePointerInTextLayer(element) {
                    if (!this.#enabled) {
                        this.#waitingElements.delete(element);
                        return;
                    }
                    const children = this.#textChildren;
                    if (!children || children.length === 0) {
                        return;
                    }
                    const {
                        id
                    } = element;
                    const nodeIndex = this.#textNodes.get(id);
                    if (nodeIndex === undefined) {
                        return;
                    }
                    const node = children[nodeIndex];
                    this.#textNodes.delete(id);
                    let owns = node.getAttribute("aria-owns");
                    if (owns?.includes(id)) {
                        owns = owns.split(" ").filter(x => x !== id).join(" ");
                        if (owns) {
                            node.setAttribute("aria-owns", owns);
                        } else {
                            node.removeAttribute("aria-owns");
                            node.setAttribute("role", "presentation");
                        }
                    }
                }

                #addIdToAriaOwns(id, node) {
                    const owns = node.getAttribute("aria-owns");
                    if (!owns?.includes(id)) {
                        node.setAttribute("aria-owns", owns ? `${owns} ${id}` : id);
                    }
                    node.removeAttribute("role");
                }

                addPointerInTextLayer(element, isRemovable) {
                    const {
                        id
                    } = element;
                    if (!id) {
                        return null;
                    }
                    if (!this.#enabled) {
                        this.#waitingElements.set(element, isRemovable);
                        return null;
                    }
                    if (isRemovable) {
                        this.removePointerInTextLayer(element);
                    }
                    const children = this.#textChildren;
                    if (!children || children.length === 0) {
                        return null;
                    }
                    const index = (0, _ui_utils.binarySearchFirstItem)(children, node => TextAccessibilityManager.#compareElementPositions(element, node) < 0);
                    const nodeIndex = Math.max(0, index - 1);
                    const child = children[nodeIndex];
                    this.#addIdToAriaOwns(id, child);
                    this.#textNodes.set(id, nodeIndex);
                    const parent = child.parentNode;
                    return parent?.classList.contains("markedContent") ? parent.id : null;
                }

                moveElementInDOM(container, element, contentElement, isRemovable) {
                    const id = this.addPointerInTextLayer(contentElement, isRemovable);
                    if (!container.hasChildNodes()) {
                        container.append(element);
                        return id;
                    }
                    const children = Array.from(container.childNodes).filter(node => node !== element);
                    if (children.length === 0) {
                        return id;
                    }
                    const elementToCompare = contentElement || element;
                    const index = (0, _ui_utils.binarySearchFirstItem)(children, node => TextAccessibilityManager.#compareElementPositions(elementToCompare, node) < 0);
                    if (index === 0) {
                        children[0].before(element);
                    } else {
                        children[index - 1].after(element);
                    }
                    return id;
                }
            }

            exports.TextAccessibilityManager = TextAccessibilityManager;

            /***/
        }),
        /* 36 */
        /***/ ((__unused_webpack_module, exports) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.TextHighlighter = void 0;

            class TextHighlighter {
                constructor({
                                findController,
                                eventBus,
                                pageIndex
                            }) {
                    this.findController = findController;
                    this.matches = [];
                    this.eventBus = eventBus;
                    this.pageIdx = pageIndex;
                    this._onUpdateTextLayerMatches = null;
                    this.textDivs = null;
                    this.textContentItemsStr = null;
                    this.enabled = false;
                }

                setTextMapping(divs, texts) {
                    this.textDivs = divs;
                    this.textContentItemsStr = texts;
                }

                enable() {
                    if (!this.textDivs || !this.textContentItemsStr) {
                        throw new Error("Text divs and strings have not been set.");
                    }
                    if (this.enabled) {
                        throw new Error("TextHighlighter is already enabled.");
                    }
                    this.enabled = true;
                    if (!this._onUpdateTextLayerMatches) {
                        this._onUpdateTextLayerMatches = evt => {
                            if (evt.pageIndex === this.pageIdx || evt.pageIndex === -1) {
                                this._updateMatches();
                            }
                        };
                        this.eventBus._on("updatetextlayermatches", this._onUpdateTextLayerMatches);
                    }
                    this._updateMatches();
                }

                disable() {
                    if (!this.enabled) {
                        return;
                    }
                    this.enabled = false;
                    if (this._onUpdateTextLayerMatches) {
                        this.eventBus._off("updatetextlayermatches", this._onUpdateTextLayerMatches);
                        this._onUpdateTextLayerMatches = null;
                    }
                    this._updateMatches(true);
                }

                _convertMatches(matches, matchesLength) {
                    if (!matches) {
                        return [];
                    }
                    const {
                        textContentItemsStr
                    } = this;
                    let i = 0,
                        iIndex = 0;
                    const end = textContentItemsStr.length - 1;
                    const result = [];
                    for (let m = 0, mm = matches.length; m < mm; m++) {
                        let matchIdx = matches[m];
                        while (i !== end && matchIdx >= iIndex + textContentItemsStr[i].length) {
                            iIndex += textContentItemsStr[i].length;
                            i++;
                        }
                        if (i === textContentItemsStr.length) {
                            console.error("Could not find a matching mapping");
                        }
                        const match = {
                            begin: {
                                divIdx: i,
                                offset: matchIdx - iIndex
                            }
                        };
                        matchIdx += matchesLength[m];
                        while (i !== end && matchIdx > iIndex + textContentItemsStr[i].length) {
                            iIndex += textContentItemsStr[i].length;
                            i++;
                        }
                        match.end = {
                            divIdx: i,
                            offset: matchIdx - iIndex
                        };
                        result.push(match);
                    }
                    return result;
                }

                _renderMatches(matches) {
                    if (matches.length === 0) {
                        return;
                    }
                    const {
                        findController,
                        pageIdx
                    } = this;
                    const {
                        textContentItemsStr,
                        textDivs
                    } = this;
                    const isSelectedPage = pageIdx === findController.selected.pageIdx;
                    const selectedMatchIdx = findController.selected.matchIdx;
                    const highlightAll = findController.state.highlightAll;
                    let prevEnd = null;
                    const infinity = {
                        divIdx: -1,
                        offset: undefined
                    };

                    function beginText(begin, className) {
                        const divIdx = begin.divIdx;
                        textDivs[divIdx].textContent = "";
                        return appendTextToDiv(divIdx, 0, begin.offset, className);
                    }

                    function appendTextToDiv(divIdx, fromOffset, toOffset, className) {
                        let div = textDivs[divIdx];
                        if (div.nodeType === Node.TEXT_NODE) {
                            const span = document.createElement("span");
                            div.before(span);
                            span.append(div);
                            textDivs[divIdx] = span;
                            div = span;
                        }
                        const content = textContentItemsStr[divIdx].substring(fromOffset, toOffset);
                        const node = document.createTextNode(content);
                        if (className) {
                            const span = document.createElement("span");
                            span.className = `${className} appended`;
                            span.append(node);
                            div.append(span);
                            return className.includes("selected") ? span.offsetLeft : 0;
                        }
                        div.append(node);
                        return 0;
                    }

                    let i0 = selectedMatchIdx,
                        i1 = i0 + 1;
                    if (highlightAll) {
                        i0 = 0;
                        i1 = matches.length;
                    } else if (!isSelectedPage) {
                        return;
                    }
                    let lastDivIdx = -1;
                    let lastOffset = -1;
                    for (let i = i0; i < i1; i++) {
                        const match = matches[i];
                        const begin = match.begin;
                        if (begin.divIdx === lastDivIdx && begin.offset === lastOffset) {
                            continue;
                        }
                        lastDivIdx = begin.divIdx;
                        lastOffset = begin.offset;
                        const end = match.end;
                        const isSelected = isSelectedPage && i === selectedMatchIdx;
                        const highlightSuffix = isSelected ? " selected" : "";
                        let selectedLeft = 0;
                        if (!prevEnd || begin.divIdx !== prevEnd.divIdx) {
                            if (prevEnd !== null) {
                                appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
                            }
                            beginText(begin);
                        } else {
                            appendTextToDiv(prevEnd.divIdx, prevEnd.offset, begin.offset);
                        }
                        if (begin.divIdx === end.divIdx) {
                            selectedLeft = appendTextToDiv(begin.divIdx, begin.offset, end.offset, "highlight" + highlightSuffix);
                        } else {
                            selectedLeft = appendTextToDiv(begin.divIdx, begin.offset, infinity.offset, "highlight begin" + highlightSuffix);
                            for (let n0 = begin.divIdx + 1, n1 = end.divIdx; n0 < n1; n0++) {
                                textDivs[n0].className = "highlight middle" + highlightSuffix;
                            }
                            beginText(end, "highlight end" + highlightSuffix);
                        }
                        prevEnd = end;
                        if (isSelected) {
                            findController.scrollMatchIntoView({
                                element: textDivs[begin.divIdx],
                                selectedLeft,
                                pageIndex: pageIdx,
                                matchIndex: selectedMatchIdx
                            });
                        }
                    }
                    if (prevEnd) {
                        appendTextToDiv(prevEnd.divIdx, prevEnd.offset, infinity.offset);
                    }
                }

                _updateMatches(reset = false) {
                    if (!this.enabled && !reset) {
                        return;
                    }
                    const {
                        findController,
                        matches,
                        pageIdx
                    } = this;
                    const {
                        textContentItemsStr,
                        textDivs
                    } = this;
                    let clearedUntilDivIdx = -1;
                    for (const match of matches) {
                        const begin = Math.max(clearedUntilDivIdx, match.begin.divIdx);
                        for (let n = begin, end = match.end.divIdx; n <= end; n++) {
                            const div = textDivs[n];
                            div.textContent = textContentItemsStr[n];
                            div.className = "";
                        }
                        clearedUntilDivIdx = match.end.divIdx + 1;
                    }
                    if (!findController?.highlightMatches || reset) {
                        return;
                    }
                    const pageMatches = findController.pageMatches[pageIdx] || null;
                    const pageMatchesLength = findController.pageMatchesLength[pageIdx] || null;
                    this.matches = this._convertMatches(pageMatches, pageMatchesLength);
                    this._renderMatches(this.matches);
                }
            }

            exports.TextHighlighter = TextHighlighter;

            /***/
        }),
        /* 37 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.TextLayerBuilder = void 0;
            var _pdfjsLib = __webpack_require__(4);
            var _ui_utils = __webpack_require__(3);

            class TextLayerBuilder {
                #enablePermissions = false;
                #rotation = 0;
                #scale = 0;
                #textContentSource = null;

                constructor({
                                highlighter = null,
                                accessibilityManager = null,
                                isOffscreenCanvasSupported = true,
                                enablePermissions = false
                            }) {
                    this.textContentItemsStr = [];
                    this.renderingDone = false;
                    this.textDivs = [];
                    this.textDivProperties = new WeakMap();
                    this.textLayerRenderTask = null;
                    this.highlighter = highlighter;
                    this.accessibilityManager = accessibilityManager;
                    this.isOffscreenCanvasSupported = isOffscreenCanvasSupported;
                    this.#enablePermissions = enablePermissions === true;
                    this.div = document.createElement("div");
                    this.div.className = "textLayer";
                    this.hide();
                }

                #finishRendering() {
                    this.renderingDone = true;
                    const endOfContent = document.createElement("div");
                    endOfContent.className = "endOfContent";
                    this.div.append(endOfContent);
                    this.#bindMouse();
                }

                get numTextDivs() {
                    return this.textDivs.length;
                }

                async render(viewport) {
                    if (!this.#textContentSource) {
                        throw new Error('No "textContentSource" parameter specified.');
                    }
                    const scale = viewport.scale * (globalThis.devicePixelRatio || 1);
                    const {
                        rotation
                    } = viewport;
                    if (this.renderingDone) {
                        const mustRotate = rotation !== this.#rotation;
                        const mustRescale = scale !== this.#scale;
                        if (mustRotate || mustRescale) {
                            this.hide();
                            (0, _pdfjsLib.updateTextLayer)({
                                container: this.div,
                                viewport,
                                textDivs: this.textDivs,
                                textDivProperties: this.textDivProperties,
                                isOffscreenCanvasSupported: this.isOffscreenCanvasSupported,
                                mustRescale,
                                mustRotate
                            });
                            this.#scale = scale;
                            this.#rotation = rotation;
                        }
                        this.show();
                        return;
                    }
                    this.cancel();
                    this.highlighter?.setTextMapping(this.textDivs, this.textContentItemsStr);
                    this.accessibilityManager?.setTextMapping(this.textDivs);
                    this.textLayerRenderTask = (0, _pdfjsLib.renderTextLayer)({
                        textContentSource: this.#textContentSource,
                        container: this.div,
                        viewport,
                        textDivs: this.textDivs,
                        textDivProperties: this.textDivProperties,
                        textContentItemsStr: this.textContentItemsStr,
                        isOffscreenCanvasSupported: this.isOffscreenCanvasSupported
                    });
                    await this.textLayerRenderTask.promise;
                    this.#finishRendering();
                    this.#scale = scale;
                    this.#rotation = rotation;
                    this.show();
                    this.accessibilityManager?.enable();
                }

                hide() {
                    if (!this.div.hidden) {
                        this.highlighter?.disable();
                        this.div.hidden = true;
                    }
                }

                show() {
                    if (this.div.hidden && this.renderingDone) {
                        this.div.hidden = false;
                        this.highlighter?.enable();
                    }
                }

                cancel() {
                    if (this.textLayerRenderTask) {
                        this.textLayerRenderTask.cancel();
                        this.textLayerRenderTask = null;
                    }
                    this.highlighter?.disable();
                    this.accessibilityManager?.disable();
                    this.textContentItemsStr.length = 0;
                    this.textDivs.length = 0;
                    this.textDivProperties = new WeakMap();
                }

                setTextContentSource(source) {
                    this.cancel();
                    this.#textContentSource = source;
                }

                #bindMouse() {
                    const {
                        div
                    } = this;
                    div.addEventListener("mousedown", evt => {
                        const end = div.querySelector(".endOfContent");
                        if (!end) {
                            return;
                        }
                        let adjustTop = evt.target !== div;
                        adjustTop &&= getComputedStyle(end).getPropertyValue("-moz-user-select") !== "none";
                        if (adjustTop) {
                            const divBounds = div.getBoundingClientRect();
                            const r = Math.max(0, (evt.pageY - divBounds.top) / divBounds.height);
                            end.style.top = (r * 100).toFixed(2) + "%";
                        }
                        end.classList.add("active");
                    });
                    div.addEventListener("mouseup", () => {
                        const end = div.querySelector(".endOfContent");
                        if (!end) {
                            return;
                        }
                        end.style.top = "";
                        end.classList.remove("active");
                    });
                    div.addEventListener("copy", event => {
                        if (!this.#enablePermissions) {
                            const selection = document.getSelection();
                            event.clipboardData.setData("text/plain", (0, _ui_utils.removeNullCharacters)((0, _pdfjsLib.normalizeUnicode)(selection.toString())));
                        }
                        event.preventDefault();
                        event.stopPropagation();
                    });
                }
            }

            exports.TextLayerBuilder = TextLayerBuilder;

            /***/
        }),
        /* 38 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.XfaLayerBuilder = void 0;
            var _pdfjsLib = __webpack_require__(4);

            class XfaLayerBuilder {
                constructor({
                                pageDiv,
                                pdfPage,
                                annotationStorage = null,
                                linkService,
                                xfaHtml = null
                            }) {
                    this.pageDiv = pageDiv;
                    this.pdfPage = pdfPage;
                    this.annotationStorage = annotationStorage;
                    this.linkService = linkService;
                    this.xfaHtml = xfaHtml;
                    this.div = null;
                    this._cancelled = false;
                }

                async render(viewport, intent = "display") {
                    if (intent === "print") {
                        const parameters = {
                            viewport: viewport.clone({
                                dontFlip: true
                            }),
                            div: this.div,
                            xfaHtml: this.xfaHtml,
                            annotationStorage: this.annotationStorage,
                            linkService: this.linkService,
                            intent
                        };
                        const div = document.createElement("div");
                        this.pageDiv.append(div);
                        parameters.div = div;
                        return _pdfjsLib.XfaLayer.render(parameters);
                    }
                    const xfaHtml = await this.pdfPage.getXfa();
                    if (this._cancelled || !xfaHtml) {
                        return {
                            textDivs: []
                        };
                    }
                    const parameters = {
                        viewport: viewport.clone({
                            dontFlip: true
                        }),
                        div: this.div,
                        xfaHtml,
                        annotationStorage: this.annotationStorage,
                        linkService: this.linkService,
                        intent
                    };
                    if (this.div) {
                        return _pdfjsLib.XfaLayer.update(parameters);
                    }
                    this.div = document.createElement("div");
                    this.pageDiv.append(this.div);
                    parameters.div = this.div;
                    return _pdfjsLib.XfaLayer.render(parameters);
                }

                cancel() {
                    this._cancelled = true;
                }

                hide() {
                    if (!this.div) {
                        return;
                    }
                    this.div.hidden = true;
                }
            }

            exports.XfaLayerBuilder = XfaLayerBuilder;

            /***/
        }),
        /* 39 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.SecondaryToolbar = void 0;
            var _ui_utils = __webpack_require__(3);
            var _pdf_viewer = __webpack_require__(29);

            class SecondaryToolbar {
                constructor(options, eventBus) {
                    this.toolbar = options.toolbar;
                    this.toggleButton = options.toggleButton;
                    this.buttons = [{
                        element: options.presentationModeButton,
                        eventName: "presentationmode",
                        close: true
                    }, {
                        element: options.printButton,
                        eventName: "print",
                        close: true
                    }, {
                        element: options.downloadButton,
                        eventName: "download",
                        close: true
                    }, {
                        element: options.viewBookmarkButton,
                        eventName: null,
                        close: true
                    }, {
                        element: options.firstPageButton,
                        eventName: "firstpage",
                        close: true
                    }, {
                        element: options.lastPageButton,
                        eventName: "lastpage",
                        close: true
                    }, {
                        element: options.pageRotateCwButton,
                        eventName: "rotatecw",
                        close: false
                    }, {
                        element: options.pageRotateCcwButton,
                        eventName: "rotateccw",
                        close: false
                    }, {
                        element: options.cursorSelectToolButton,
                        eventName: "switchcursortool",
                        eventDetails: {
                            tool: _ui_utils.CursorTool.SELECT
                        },
                        close: true
                    }, {
                        element: options.cursorHandToolButton,
                        eventName: "switchcursortool",
                        eventDetails: {
                            tool: _ui_utils.CursorTool.HAND
                        },
                        close: true
                    }, {
                        element: options.scrollPageButton,
                        eventName: "switchscrollmode",
                        eventDetails: {
                            mode: _ui_utils.ScrollMode.PAGE
                        },
                        close: true
                    }, {
                        element: options.scrollVerticalButton,
                        eventName: "switchscrollmode",
                        eventDetails: {
                            mode: _ui_utils.ScrollMode.VERTICAL
                        },
                        close: true
                    }, {
                        element: options.scrollHorizontalButton,
                        eventName: "switchscrollmode",
                        eventDetails: {
                            mode: _ui_utils.ScrollMode.HORIZONTAL
                        },
                        close: true
                    }, {
                        element: options.scrollWrappedButton,
                        eventName: "switchscrollmode",
                        eventDetails: {
                            mode: _ui_utils.ScrollMode.WRAPPED
                        },
                        close: true
                    }, {
                        element: options.spreadNoneButton,
                        eventName: "switchspreadmode",
                        eventDetails: {
                            mode: _ui_utils.SpreadMode.NONE
                        },
                        close: true
                    }, {
                        element: options.spreadOddButton,
                        eventName: "switchspreadmode",
                        eventDetails: {
                            mode: _ui_utils.SpreadMode.ODD
                        },
                        close: true
                    }, {
                        element: options.spreadEvenButton,
                        eventName: "switchspreadmode",
                        eventDetails: {
                            mode: _ui_utils.SpreadMode.EVEN
                        },
                        close: true
                    }, {
                        element: options.documentPropertiesButton,
                        eventName: "documentproperties",
                        close: true
                    }];
                    this.buttons.push({
                        element: options.openFileButton,
                        eventName: "openfile",
                        close: true
                    });
                    this.items = {
                        firstPage: options.firstPageButton,
                        lastPage: options.lastPageButton,
                        pageRotateCw: options.pageRotateCwButton,
                        pageRotateCcw: options.pageRotateCcwButton
                    };
                    this.eventBus = eventBus;
                    this.opened = false;
                    this.#bindClickListeners();
                    this.#bindCursorToolsListener(options);
                    this.#bindScrollModeListener(options);
                    this.#bindSpreadModeListener(options);
                    this.reset();
                }

                get isOpen() {
                    return this.opened;
                }

                setPageNumber(pageNumber) {
                    this.pageNumber = pageNumber;
                    this.#updateUIState();
                }

                setPagesCount(pagesCount) {
                    this.pagesCount = pagesCount;
                    this.#updateUIState();
                }

                reset() {
                    this.pageNumber = 0;
                    this.pagesCount = 0;
                    this.#updateUIState();
                    this.eventBus.dispatch("secondarytoolbarreset", {
                        source: this
                    });
                }

                #updateUIState() {
                    this.items.firstPage.disabled = this.pageNumber <= 1;
                    this.items.lastPage.disabled = this.pageNumber >= this.pagesCount;
                    this.items.pageRotateCw.disabled = this.pagesCount === 0;
                    this.items.pageRotateCcw.disabled = this.pagesCount === 0;
                }

                #bindClickListeners() {
                    this.toggleButton.addEventListener("click", this.toggle.bind(this));
                    for (const {
                        element,
                        eventName,
                        close,
                        eventDetails
                    } of this.buttons) {
                        element.addEventListener("click", evt => {
                            if (eventName !== null) {
                                this.eventBus.dispatch(eventName, {
                                    source: this,
                                    ...eventDetails
                                });
                            }
                            if (close) {
                                this.close();
                            }
                            this.eventBus.dispatch("reporttelemetry", {
                                source: this,
                                details: {
                                    type: "buttons",
                                    data: {
                                        id: element.id
                                    }
                                }
                            });
                        });
                    }
                }

                #bindCursorToolsListener({
                                             cursorSelectToolButton,
                                             cursorHandToolButton
                                         }) {
                    this.eventBus._on("cursortoolchanged", ({
                                                                tool
                                                            }) => {
                        (0, _ui_utils.toggleCheckedBtn)(cursorSelectToolButton, tool === _ui_utils.CursorTool.SELECT);
                        (0, _ui_utils.toggleCheckedBtn)(cursorHandToolButton, tool === _ui_utils.CursorTool.HAND);
                    });
                }

                #bindScrollModeListener({
                                            scrollPageButton,
                                            scrollVerticalButton,
                                            scrollHorizontalButton,
                                            scrollWrappedButton,
                                            spreadNoneButton,
                                            spreadOddButton,
                                            spreadEvenButton
                                        }) {
                    const scrollModeChanged = ({
                                                   mode
                                               }) => {
                        (0, _ui_utils.toggleCheckedBtn)(scrollPageButton, mode === _ui_utils.ScrollMode.PAGE);
                        (0, _ui_utils.toggleCheckedBtn)(scrollVerticalButton, mode === _ui_utils.ScrollMode.VERTICAL);
                        (0, _ui_utils.toggleCheckedBtn)(scrollHorizontalButton, mode === _ui_utils.ScrollMode.HORIZONTAL);
                        (0, _ui_utils.toggleCheckedBtn)(scrollWrappedButton, mode === _ui_utils.ScrollMode.WRAPPED);
                        const forceScrollModePage = this.pagesCount > _pdf_viewer.PagesCountLimit.FORCE_SCROLL_MODE_PAGE;
                        scrollPageButton.disabled = forceScrollModePage;
                        scrollVerticalButton.disabled = forceScrollModePage;
                        scrollHorizontalButton.disabled = forceScrollModePage;
                        scrollWrappedButton.disabled = forceScrollModePage;
                        const isHorizontal = mode === _ui_utils.ScrollMode.HORIZONTAL;
                        spreadNoneButton.disabled = isHorizontal;
                        spreadOddButton.disabled = isHorizontal;
                        spreadEvenButton.disabled = isHorizontal;
                    };
                    this.eventBus._on("scrollmodechanged", scrollModeChanged);
                    this.eventBus._on("secondarytoolbarreset", evt => {
                        if (evt.source === this) {
                            scrollModeChanged({
                                mode: _ui_utils.ScrollMode.VERTICAL
                            });
                        }
                    });
                }

                #bindSpreadModeListener({
                                            spreadNoneButton,
                                            spreadOddButton,
                                            spreadEvenButton
                                        }) {
                    const spreadModeChanged = ({
                                                   mode
                                               }) => {
                        (0, _ui_utils.toggleCheckedBtn)(spreadNoneButton, mode === _ui_utils.SpreadMode.NONE);
                        (0, _ui_utils.toggleCheckedBtn)(spreadOddButton, mode === _ui_utils.SpreadMode.ODD);
                        (0, _ui_utils.toggleCheckedBtn)(spreadEvenButton, mode === _ui_utils.SpreadMode.EVEN);
                    };
                    this.eventBus._on("spreadmodechanged", spreadModeChanged);
                    this.eventBus._on("secondarytoolbarreset", evt => {
                        if (evt.source === this) {
                            spreadModeChanged({
                                mode: _ui_utils.SpreadMode.NONE
                            });
                        }
                    });
                }

                open() {
                    if (this.opened) {
                        return;
                    }
                    this.opened = true;
                    (0, _ui_utils.toggleExpandedBtn)(this.toggleButton, true, this.toolbar);
                }

                close() {
                    if (!this.opened) {
                        return;
                    }
                    this.opened = false;
                    (0, _ui_utils.toggleExpandedBtn)(this.toggleButton, false, this.toolbar);
                }

                toggle() {
                    if (this.opened) {
                        this.close();
                    } else {
                        this.open();
                    }
                }
            }

            exports.SecondaryToolbar = SecondaryToolbar;

            /***/
        }),
        /* 40 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.Toolbar = void 0;
            var _ui_utils = __webpack_require__(3);
            var _pdfjsLib = __webpack_require__(4);
            const PAGE_NUMBER_LOADING_INDICATOR = "visiblePageIsLoading";

            class Toolbar {
                #wasLocalized = false;

                constructor(options, eventBus, l10n) {
                    this.toolbar = options.container;
                    this.eventBus = eventBus;
                    this.l10n = l10n;
                    this.buttons = [{
                        element: options.previous,
                        eventName: "previouspage"
                    }, {
                        element: options.next,
                        eventName: "nextpage"
                    }, {
                        element: options.zoomIn,
                        eventName: "zoomin"
                    }, {
                        element: options.zoomOut,
                        eventName: "zoomout"
                    }, {
                        element: options.print,
                        eventName: "print"
                    }, {
                        element: options.download,
                        eventName: "download"
                    }, {
                        element: options.editorFreeTextButton,
                        eventName: "switchannotationeditormode",
                        eventDetails: {
                            get mode() {
                                const {
                                    classList
                                } = options.editorFreeTextButton;
                                return classList.contains("toggled") ? _pdfjsLib.AnnotationEditorType.NONE : _pdfjsLib.AnnotationEditorType.FREETEXT;
                            }
                        }
                    }, {
                        element: options.editorInkButton,
                        eventName: "switchannotationeditormode",
                        eventDetails: {
                            get mode() {
                                const {
                                    classList
                                } = options.editorInkButton;
                                return classList.contains("toggled") ? _pdfjsLib.AnnotationEditorType.NONE : _pdfjsLib.AnnotationEditorType.INK;
                            }
                        }
                    }, {
                        element: options.editorStampButton,
                        eventName: "switchannotationeditormode",
                        eventDetails: {
                            get mode() {
                                const {
                                    classList
                                } = options.editorStampButton;
                                return classList.contains("toggled") ? _pdfjsLib.AnnotationEditorType.NONE : _pdfjsLib.AnnotationEditorType.STAMP;
                            }
                        }
                    }];
                    this.buttons.push({
                        element: options.openFile,
                        eventName: "openfile"
                    });
                    this.items = {
                        numPages: options.numPages,
                        pageNumber: options.pageNumber,
                        scaleSelect: options.scaleSelect,
                        customScaleOption: options.customScaleOption,
                        previous: options.previous,
                        next: options.next,
                        zoomIn: options.zoomIn,
                        zoomOut: options.zoomOut
                    };
                    this.#bindListeners(options);
                    this.reset();
                }

                setPageNumber(pageNumber, pageLabel) {
                    this.pageNumber = pageNumber;
                    this.pageLabel = pageLabel;
                    this.#updateUIState(false);
                }

                setPagesCount(pagesCount, hasPageLabels) {
                    this.pagesCount = pagesCount;
                    this.hasPageLabels = hasPageLabels;
                    this.#updateUIState(true);
                }

                setPageScale(pageScaleValue, pageScale) {
                    this.pageScaleValue = (pageScaleValue || pageScale).toString();
                    this.pageScale = pageScale;
                    this.#updateUIState(false);
                }

                reset() {
                    this.pageNumber = 0;
                    this.pageLabel = null;
                    this.hasPageLabels = false;
                    this.pagesCount = 0;
                    this.pageScaleValue = _ui_utils.DEFAULT_SCALE_VALUE;
                    this.pageScale = _ui_utils.DEFAULT_SCALE;
                    this.#updateUIState(true);
                    this.updateLoadingIndicatorState();
                    this.eventBus.dispatch("toolbarreset", {
                        source: this
                    });
                }

                #bindListeners(options) {
                    const {
                        pageNumber,
                        scaleSelect
                    } = this.items;
                    const self = this;
                    for (const {
                        element,
                        eventName,
                        eventDetails
                    } of this.buttons) {
                        element.addEventListener("click", evt => {
                            if (eventName !== null) {
                                this.eventBus.dispatch(eventName, {
                                    source: this,
                                    ...eventDetails
                                });
                            }
                        });
                    }
                    pageNumber.addEventListener("click", function () {
                        this.select();
                    });
                    pageNumber.addEventListener("change", function () {
                        self.eventBus.dispatch("pagenumberchanged", {
                            source: self,
                            value: this.value
                        });
                    });
                    scaleSelect.addEventListener("change", function () {
                        if (this.value === "custom") {
                            return;
                        }
                        self.eventBus.dispatch("scalechanged", {
                            source: self,
                            value: this.value
                        });
                    });
                    scaleSelect.addEventListener("click", function (evt) {
                        const target = evt.target;
                        if (this.value === self.pageScaleValue && target.tagName.toUpperCase() === "OPTION") {
                            this.blur();
                        }
                    });
                    scaleSelect.oncontextmenu = _pdfjsLib.noContextMenu;
                    this.eventBus._on("localized", () => {
                        this.#wasLocalized = true;
                        this.#adjustScaleWidth();
                        this.#updateUIState(true);
                    });
                    this.#bindEditorToolsListener(options);
                }

                #bindEditorToolsListener({
                                             editorFreeTextButton,
                                             editorFreeTextParamsToolbar,
                                             editorInkButton,
                                             editorInkParamsToolbar,
                                             editorStampButton,
                                             editorStampParamsToolbar
                                         }) {
                    const editorModeChanged = ({
                                                   mode
                                               }) => {
                        (0, _ui_utils.toggleCheckedBtn)(editorFreeTextButton, mode === _pdfjsLib.AnnotationEditorType.FREETEXT, editorFreeTextParamsToolbar);
                        (0, _ui_utils.toggleCheckedBtn)(editorInkButton, mode === _pdfjsLib.AnnotationEditorType.INK, editorInkParamsToolbar);
                        (0, _ui_utils.toggleCheckedBtn)(editorStampButton, mode === _pdfjsLib.AnnotationEditorType.STAMP, editorStampParamsToolbar);
                        const isDisable = mode === _pdfjsLib.AnnotationEditorType.DISABLE;
                        editorFreeTextButton.disabled = isDisable;
                        editorInkButton.disabled = isDisable;
                        editorStampButton.disabled = isDisable;
                    };
                    this.eventBus._on("annotationeditormodechanged", editorModeChanged);
                    this.eventBus._on("toolbarreset", evt => {
                        if (evt.source === this) {
                            editorModeChanged({
                                mode: _pdfjsLib.AnnotationEditorType.DISABLE
                            });
                        }
                    });
                }

                #updateUIState(resetNumPages = false) {
                    if (!this.#wasLocalized) {
                        return;
                    }
                    const {
                        pageNumber,
                        pagesCount,
                        pageScaleValue,
                        pageScale,
                        items
                    } = this;
                    if (resetNumPages) {
                        if (this.hasPageLabels) {
                            items.pageNumber.type = "text";
                        } else {
                            items.pageNumber.type = "number";
                            this.l10n.get("of_pages", {
                                pagesCount
                            }).then(msg => {
                                items.numPages.textContent = msg;
                            });
                        }
                        items.pageNumber.max = pagesCount;
                    }
                    if (this.hasPageLabels) {
                        items.pageNumber.value = this.pageLabel;
                        this.l10n.get("page_of_pages", {
                            pageNumber,
                            pagesCount
                        }).then(msg => {
                            items.numPages.textContent = msg;
                        });
                    } else {
                        items.pageNumber.value = pageNumber;
                    }
                    items.previous.disabled = pageNumber <= 1;
                    items.next.disabled = pageNumber >= pagesCount;
                    items.zoomOut.disabled = pageScale <= _ui_utils.MIN_SCALE;
                    items.zoomIn.disabled = pageScale >= _ui_utils.MAX_SCALE;
                    this.l10n.get("page_scale_percent", {
                        scale: Math.round(pageScale * 10000) / 100
                    }).then(msg => {
                        let predefinedValueFound = false;
                        for (const option of items.scaleSelect.options) {
                            if (option.value !== pageScaleValue) {
                                option.selected = false;
                                continue;
                            }
                            option.selected = true;
                            predefinedValueFound = true;
                        }
                        if (!predefinedValueFound) {
                            items.customScaleOption.textContent = msg;
                            items.customScaleOption.selected = true;
                        }
                    });
                }

                updateLoadingIndicatorState(loading = false) {
                    const {
                        pageNumber
                    } = this.items;
                    pageNumber.classList.toggle(PAGE_NUMBER_LOADING_INDICATOR, loading);
                }

                async #adjustScaleWidth() {
                    const {
                        items,
                        l10n
                    } = this;
                    const predefinedValuesPromise = Promise.all([l10n.get("page_scale_auto"), l10n.get("page_scale_actual"), l10n.get("page_scale_fit"), l10n.get("page_scale_width")]);
                    await _ui_utils.animationStarted;
                    const style = getComputedStyle(items.scaleSelect);
                    const scaleSelectWidth = parseFloat(style.getPropertyValue("--scale-select-width"));
                    const canvas = document.createElement("canvas");
                    const ctx = canvas.getContext("2d", {
                        alpha: false
                    });
                    ctx.font = `${style.fontSize} ${style.fontFamily}`;
                    let maxWidth = 0;
                    for (const predefinedValue of await predefinedValuesPromise) {
                        const {
                            width
                        } = ctx.measureText(predefinedValue);
                        if (width > maxWidth) {
                            maxWidth = width;
                        }
                    }
                    maxWidth += 0.3 * scaleSelectWidth;
                    if (maxWidth > scaleSelectWidth) {
                        const container = items.scaleSelect.parentNode;
                        container.style.setProperty("--scale-select-width", `${maxWidth}px`);
                    }
                    canvas.width = 0;
                    canvas.height = 0;
                }
            }

            exports.Toolbar = Toolbar;

            /***/
        }),
        /* 41 */
        /***/ ((__unused_webpack_module, exports) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.ViewHistory = void 0;
            const DEFAULT_VIEW_HISTORY_CACHE_SIZE = 20;

            class ViewHistory {
                constructor(fingerprint, cacheSize = DEFAULT_VIEW_HISTORY_CACHE_SIZE) {
                    this.fingerprint = fingerprint;
                    this.cacheSize = cacheSize;
                    this._initializedPromise = this._readFromStorage().then(databaseStr => {
                        const database = JSON.parse(databaseStr || "{}");
                        let index = -1;
                        if (!Array.isArray(database.files)) {
                            database.files = [];
                        } else {
                            while (database.files.length >= this.cacheSize) {
                                database.files.shift();
                            }
                            for (let i = 0, ii = database.files.length; i < ii; i++) {
                                const branch = database.files[i];
                                if (branch.fingerprint === this.fingerprint) {
                                    index = i;
                                    break;
                                }
                            }
                        }
                        if (index === -1) {
                            index = database.files.push({
                                fingerprint: this.fingerprint
                            }) - 1;
                        }
                        this.file = database.files[index];
                        this.database = database;
                    });
                }

                async _writeToStorage() {
                    const databaseStr = JSON.stringify(this.database);
                    localStorage.setItem("pdfjs.history", databaseStr);
                }

                async _readFromStorage() {
                    return localStorage.getItem("pdfjs.history");
                }

                async set(name, val) {
                    await this._initializedPromise;
                    this.file[name] = val;
                    return this._writeToStorage();
                }

                async setMultiple(properties) {
                    await this._initializedPromise;
                    for (const name in properties) {
                        this.file[name] = properties[name];
                    }
                    return this._writeToStorage();
                }

                async get(name, defaultValue) {
                    await this._initializedPromise;
                    const val = this.file[name];
                    return val !== undefined ? val : defaultValue;
                }

                async getMultiple(properties) {
                    await this._initializedPromise;
                    const values = Object.create(null);
                    for (const name in properties) {
                        const val = this.file[name];
                        values[name] = val !== undefined ? val : properties[name];
                    }
                    return values;
                }
            }

            exports.ViewHistory = ViewHistory;

            /***/
        }),
        /* 42 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.BasePreferences = void 0;
            var _app_options = __webpack_require__(5);

            class BasePreferences {
                #defaults = Object.freeze({
                    "annotationEditorMode": 0,
                    "annotationMode": 2,
                    "cursorToolOnLoad": 0,
                    "defaultZoomDelay": 400,
                    "defaultZoomValue": "",
                    "disablePageLabels": false,
                    "enablePermissions": false,
                    "enablePrintAutoRotate": true,
                    "enableScripting": true,
                    "enableStampEditor": true,
                    "externalLinkTarget": 0,
                    "historyUpdateUrl": false,
                    "ignoreDestinationZoom": false,
                    "forcePageColors": false,
                    "pageColorsBackground": "Canvas",
                    "pageColorsForeground": "CanvasText",
                    "pdfBugEnabled": false,
                    "sidebarViewOnLoad": -1,
                    "scrollModeOnLoad": -1,
                    "spreadModeOnLoad": -1,
                    "textLayerMode": 1,
                    "viewerCssTheme": 0,
                    "viewOnLoad": 0,
                    "disableAutoFetch": false,
                    "disableFontFace": false,
                    "disableRange": false,
                    "disableStream": false,
                    "enableXfa": true
                });
                #prefs = Object.create(null);
                #initializedPromise = null;

                constructor() {
                    if (this.constructor === BasePreferences) {
                        throw new Error("Cannot initialize BasePreferences.");
                    }
                    this.#initializedPromise = this._readFromStorage(this.#defaults).then(prefs => {
                        for (const name in this.#defaults) {
                            const prefValue = prefs?.[name];
                            if (typeof prefValue === typeof this.#defaults[name]) {
                                this.#prefs[name] = prefValue;
                            }
                        }
                    });
                }

                async _writeToStorage(prefObj) {
                    throw new Error("Not implemented: _writeToStorage");
                }

                async _readFromStorage(prefObj) {
                    throw new Error("Not implemented: _readFromStorage");
                }

                async reset() {
                    await this.#initializedPromise;
                    const prefs = this.#prefs;
                    this.#prefs = Object.create(null);
                    return this._writeToStorage(this.#defaults).catch(reason => {
                        this.#prefs = prefs;
                        throw reason;
                    });
                }

                async set(name, value) {
                    await this.#initializedPromise;
                    const defaultValue = this.#defaults[name],
                        prefs = this.#prefs;
                    if (defaultValue === undefined) {
                        throw new Error(`Set preference: "${name}" is undefined.`);
                    } else if (value === undefined) {
                        throw new Error("Set preference: no value is specified.");
                    }
                    const valueType = typeof value,
                        defaultType = typeof defaultValue;
                    if (valueType !== defaultType) {
                        if (valueType === "number" && defaultType === "string") {
                            value = value.toString();
                        } else {
                            throw new Error(`Set preference: "${value}" is a ${valueType}, expected a ${defaultType}.`);
                        }
                    } else if (valueType === "number" && !Number.isInteger(value)) {
                        throw new Error(`Set preference: "${value}" must be an integer.`);
                    }
                    this.#prefs[name] = value;
                    return this._writeToStorage(this.#prefs).catch(reason => {
                        this.#prefs = prefs;
                        throw reason;
                    });
                }

                async get(name) {
                    await this.#initializedPromise;
                    const defaultValue = this.#defaults[name];
                    if (defaultValue === undefined) {
                        throw new Error(`Get preference: "${name}" is undefined.`);
                    }
                    return this.#prefs[name] ?? defaultValue;
                }

                async getAll() {
                    await this.#initializedPromise;
                    const obj = Object.create(null);
                    for (const name in this.#defaults) {
                        obj[name] = this.#prefs[name] ?? this.#defaults[name];
                    }
                    return obj;
                }
            }

            exports.BasePreferences = BasePreferences;

            /***/
        }),
        /* 43 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.DownloadManager = void 0;
            var _pdfjsLib = __webpack_require__(4);
            ;

            function download(blobUrl, filename) {
                const a = document.createElement("a");
                if (!a.click) {
                    throw new Error('DownloadManager: "a.click()" is not supported.');
                }
                a.href = blobUrl;
                a.target = "_parent";
                if ("download" in a) {
                    a.download = filename;
                }
                (document.body || document.documentElement).append(a);
                a.click();
                a.remove();
            }

            class DownloadManager {
                #openBlobUrls = new WeakMap();

                downloadUrl(url, filename, _options) {
                    if (!(0, _pdfjsLib.createValidAbsoluteUrl)(url, "http://example.com")) {
                        console.error(`downloadUrl - not a valid URL: ${url}`);
                        return;
                    }
                    download(url + "#pdfjs.action=download", filename);
                }

                downloadData(data, filename, contentType) {
                    const blobUrl = URL.createObjectURL(new Blob([data], {
                        type: contentType
                    }));
                    download(blobUrl, filename);
                }

                openOrDownloadData(element, data, filename) {
                    const isPdfData = (0, _pdfjsLib.isPdfFile)(filename);
                    const contentType = isPdfData ? "application/pdf" : "";
                    if (isPdfData) {
                        let blobUrl = this.#openBlobUrls.get(element);
                        if (!blobUrl) {
                            blobUrl = URL.createObjectURL(new Blob([data], {
                                type: contentType
                            }));
                            this.#openBlobUrls.set(element, blobUrl);
                        }
                        let viewerUrl;
                        viewerUrl = "?file=" + encodeURIComponent(blobUrl + "#" + filename);
                        try {
                            window.open(viewerUrl);
                            return true;
                        } catch (ex) {
                            console.error(`openOrDownloadData: ${ex}`);
                            URL.revokeObjectURL(blobUrl);
                            this.#openBlobUrls.delete(element);
                        }
                    }
                    this.downloadData(data, filename, contentType);
                    return false;
                }

                download(blob, url, filename, _options) {
                    const blobUrl = URL.createObjectURL(blob);
                    download(blobUrl, filename);
                }
            }

            exports.DownloadManager = DownloadManager;

            /***/
        }),
        /* 44 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.GenericL10n = void 0;
            __webpack_require__(45);
            var _l10n_utils = __webpack_require__(30);
            const PARTIAL_LANG_CODES = {
                en: "en-US",
                es: "es-ES",
                fy: "fy-NL",
                ga: "ga-IE",
                gu: "gu-IN",
                hi: "hi-IN",
                hy: "hy-AM",
                nb: "nb-NO",
                ne: "ne-NP",
                nn: "nn-NO",
                pa: "pa-IN",
                pt: "pt-PT",
                sv: "sv-SE",
                zh: "zh-CN"
            };

            function fixupLangCode(langCode) {
                return PARTIAL_LANG_CODES[langCode?.toLowerCase()] || langCode;
            }

            class GenericL10n {
                constructor(lang) {
                    const {
                        webL10n
                    } = document;
                    this._lang = lang;
                    this._ready = new Promise((resolve, reject) => {
                        webL10n.setLanguage(fixupLangCode(lang), () => {
                            resolve(webL10n);
                        });
                    });
                }

                async getLanguage() {
                    const l10n = await this._ready;
                    return l10n.getLanguage();
                }

                async getDirection() {
                    const l10n = await this._ready;
                    return l10n.getDirection();
                }

                async get(key, args = null, fallback = (0, _l10n_utils.getL10nFallback)(key, args)) {
                    const l10n = await this._ready;
                    return l10n.get(key, args, fallback);
                }

                async translate(element) {
                    const l10n = await this._ready;
                    return l10n.translate(element);
                }
            }

            exports.GenericL10n = GenericL10n;

            /***/
        }),
        /* 45 */
        /***/ (() => {


            document.webL10n = function (window, document) {
                var gL10nData = {};
                var gTextData = '';
                var gTextProp = 'textContent';
                var gLanguage = '';
                var gMacros = {};
                var gReadyState = 'loading';
                var gAsyncResourceLoading = true;

                function getL10nResourceLinks() {
                    return document.querySelectorAll('link[type="application/l10n"]');
                }

                function getL10nDictionary() {
                    var script = document.querySelector('script[type="application/l10n"]');
                    return script ? JSON.parse(script.innerHTML) : null;
                }

                function getTranslatableChildren(element) {
                    return element ? element.querySelectorAll('*[data-l10n-id]') : [];
                }

                function getL10nAttributes(element) {
                    if (!element) return {};
                    var l10nId = element.getAttribute('data-l10n-id');
                    var l10nArgs = element.getAttribute('data-l10n-args');
                    var args = {};
                    if (l10nArgs) {
                        try {
                            args = JSON.parse(l10nArgs);
                        } catch (e) {
                            console.warn('could not parse arguments for #' + l10nId);
                        }
                    }
                    return {
                        id: l10nId,
                        args: args
                    };
                }

                function xhrLoadText(url, onSuccess, onFailure) {
                    onSuccess = onSuccess || function _onSuccess(data) {
                    };
                    onFailure = onFailure || function _onFailure() {
                    };
                    var xhr = new XMLHttpRequest();
                    xhr.open('GET', url, gAsyncResourceLoading);
                    if (xhr.overrideMimeType) {
                        xhr.overrideMimeType('text/plain; charset=utf-8');
                    }
                    xhr.onreadystatechange = function () {
                        if (xhr.readyState == 4) {
                            if (xhr.status == 200 || xhr.status === 0) {
                                onSuccess(xhr.responseText);
                            } else {
                                onFailure();
                            }
                        }
                    };
                    xhr.onerror = onFailure;
                    xhr.ontimeout = onFailure;
                    try {
                        xhr.send(null);
                    } catch (e) {
                        onFailure();
                    }
                }

                function parseResource(href, lang, successCallback, failureCallback) {
                    var baseURL = href.replace(/[^\/]*$/, '') || './';

                    function evalString(text) {
                        if (text.lastIndexOf('\\') < 0) return text;
                        return text.replace(/\\\\/g, '\\').replace(/\\n/g, '\n').replace(/\\r/g, '\r').replace(/\\t/g, '\t').replace(/\\b/g, '\b').replace(/\\f/g, '\f').replace(/\\{/g, '{').replace(/\\}/g, '}').replace(/\\"/g, '"').replace(/\\'/g, "'");
                    }

                    function parseProperties(text, parsedPropertiesCallback) {
                        var dictionary = {};
                        var reBlank = /^\s*|\s*$/;
                        var reComment = /^\s*#|^\s*$/;
                        var reSection = /^\s*\[(.*)\]\s*$/;
                        var reImport = /^\s*@import\s+url\((.*)\)\s*$/i;
                        var reSplit = /^([^=\s]*)\s*=\s*(.+)$/;

                        function parseRawLines(rawText, extendedSyntax, parsedRawLinesCallback) {
                            var entries = rawText.replace(reBlank, '').split(/[\r\n]+/);
                            var currentLang = '*';
                            var genericLang = lang.split('-', 1)[0];
                            var skipLang = false;
                            var match = '';

                            function nextEntry() {
                                while (true) {
                                    if (!entries.length) {
                                        parsedRawLinesCallback();
                                        return;
                                    }
                                    var line = entries.shift();
                                    if (reComment.test(line)) continue;
                                    if (extendedSyntax) {
                                        match = reSection.exec(line);
                                        if (match) {
                                            currentLang = match[1].toLowerCase();
                                            skipLang = currentLang !== '*' && currentLang !== lang && currentLang !== genericLang;
                                            continue;
                                        } else if (skipLang) {
                                            continue;
                                        }
                                        match = reImport.exec(line);
                                        if (match) {
                                            loadImport(baseURL + match[1], nextEntry);
                                            return;
                                        }
                                    }
                                    var tmp = line.match(reSplit);
                                    if (tmp && tmp.length == 3) {
                                        dictionary[tmp[1]] = evalString(tmp[2]);
                                    }
                                }
                            }

                            nextEntry();
                        }

                        function loadImport(url, callback) {
                            xhrLoadText(url, function (content) {
                                parseRawLines(content, false, callback);
                            }, function () {
                                console.warn(url + ' not found.');
                                callback();
                            });
                        }

                        parseRawLines(text, true, function () {
                            parsedPropertiesCallback(dictionary);
                        });
                    }

                    xhrLoadText(href, function (response) {
                        gTextData += response;
                        parseProperties(response, function (data) {
                            for (var key in data) {
                                var id,
                                    prop,
                                    index = key.lastIndexOf('.');
                                if (index > 0) {
                                    id = key.substring(0, index);
                                    prop = key.substring(index + 1);
                                } else {
                                    id = key;
                                    prop = gTextProp;
                                }
                                if (!gL10nData[id]) {
                                    gL10nData[id] = {};
                                }
                                gL10nData[id][prop] = data[key];
                            }
                            if (successCallback) {
                                successCallback();
                            }
                        });
                    }, failureCallback);
                }

                function loadLocale(lang, callback) {
                    if (lang) {
                        lang = lang.toLowerCase();
                    }
                    callback = callback || function _callback() {
                    };
                    clear();
                    gLanguage = lang;
                    var langLinks = getL10nResourceLinks();
                    var langCount = langLinks.length;
                    if (langCount === 0) {
                        var dict = getL10nDictionary();
                        if (dict && dict.locales && dict.default_locale) {
                            console.log('using the embedded JSON directory, early way out');
                            gL10nData = dict.locales[lang];
                            if (!gL10nData) {
                                var defaultLocale = dict.default_locale.toLowerCase();
                                for (var anyCaseLang in dict.locales) {
                                    anyCaseLang = anyCaseLang.toLowerCase();
                                    if (anyCaseLang === lang) {
                                        gL10nData = dict.locales[lang];
                                        break;
                                    } else if (anyCaseLang === defaultLocale) {
                                        gL10nData = dict.locales[defaultLocale];
                                    }
                                }
                            }
                            callback();
                        } else {
                            console.log('no resource to load, early way out');
                        }
                        gReadyState = 'complete';
                        return;
                    }
                    var onResourceLoaded = null;
                    var gResourceCount = 0;
                    onResourceLoaded = function () {
                        gResourceCount++;
                        if (gResourceCount >= langCount) {
                            callback();
                            gReadyState = 'complete';
                        }
                    };

                    function L10nResourceLink(link) {
                        var href = link.href;
                        this.load = function (lang, callback) {
                            parseResource(href, lang, callback, function () {
                                console.warn(href + ' not found.');
                                console.warn('"' + lang + '" resource not found');
                                gLanguage = '';
                                callback();
                            });
                        };
                    }

                    for (var i = 0; i < langCount; i++) {
                        var resource = new L10nResourceLink(langLinks[i]);
                        resource.load(lang, onResourceLoaded);
                    }
                }

                function clear() {
                    gL10nData = {};
                    gTextData = '';
                    gLanguage = '';
                }

                function getPluralRules(lang) {
                    var locales2rules = {
                        'af': 3,
                        'ak': 4,
                        'am': 4,
                        'ar': 1,
                        'asa': 3,
                        'az': 0,
                        'be': 11,
                        'bem': 3,
                        'bez': 3,
                        'bg': 3,
                        'bh': 4,
                        'bm': 0,
                        'bn': 3,
                        'bo': 0,
                        'br': 20,
                        'brx': 3,
                        'bs': 11,
                        'ca': 3,
                        'cgg': 3,
                        'chr': 3,
                        'cs': 12,
                        'cy': 17,
                        'da': 3,
                        'de': 3,
                        'dv': 3,
                        'dz': 0,
                        'ee': 3,
                        'el': 3,
                        'en': 3,
                        'eo': 3,
                        'es': 3,
                        'et': 3,
                        'eu': 3,
                        'fa': 0,
                        'ff': 5,
                        'fi': 3,
                        'fil': 4,
                        'fo': 3,
                        'fr': 5,
                        'fur': 3,
                        'fy': 3,
                        'ga': 8,
                        'gd': 24,
                        'gl': 3,
                        'gsw': 3,
                        'gu': 3,
                        'guw': 4,
                        'gv': 23,
                        'ha': 3,
                        'haw': 3,
                        'he': 2,
                        'hi': 4,
                        'hr': 11,
                        'hu': 0,
                        'id': 0,
                        'ig': 0,
                        'ii': 0,
                        'is': 3,
                        'it': 3,
                        'iu': 7,
                        'ja': 0,
                        'jmc': 3,
                        'jv': 0,
                        'ka': 0,
                        'kab': 5,
                        'kaj': 3,
                        'kcg': 3,
                        'kde': 0,
                        'kea': 0,
                        'kk': 3,
                        'kl': 3,
                        'km': 0,
                        'kn': 0,
                        'ko': 0,
                        'ksb': 3,
                        'ksh': 21,
                        'ku': 3,
                        'kw': 7,
                        'lag': 18,
                        'lb': 3,
                        'lg': 3,
                        'ln': 4,
                        'lo': 0,
                        'lt': 10,
                        'lv': 6,
                        'mas': 3,
                        'mg': 4,
                        'mk': 16,
                        'ml': 3,
                        'mn': 3,
                        'mo': 9,
                        'mr': 3,
                        'ms': 0,
                        'mt': 15,
                        'my': 0,
                        'nah': 3,
                        'naq': 7,
                        'nb': 3,
                        'nd': 3,
                        'ne': 3,
                        'nl': 3,
                        'nn': 3,
                        'no': 3,
                        'nr': 3,
                        'nso': 4,
                        'ny': 3,
                        'nyn': 3,
                        'om': 3,
                        'or': 3,
                        'pa': 3,
                        'pap': 3,
                        'pl': 13,
                        'ps': 3,
                        'pt': 3,
                        'rm': 3,
                        'ro': 9,
                        'rof': 3,
                        'ru': 11,
                        'rwk': 3,
                        'sah': 0,
                        'saq': 3,
                        'se': 7,
                        'seh': 3,
                        'ses': 0,
                        'sg': 0,
                        'sh': 11,
                        'shi': 19,
                        'sk': 12,
                        'sl': 14,
                        'sma': 7,
                        'smi': 7,
                        'smj': 7,
                        'smn': 7,
                        'sms': 7,
                        'sn': 3,
                        'so': 3,
                        'sq': 3,
                        'sr': 11,
                        'ss': 3,
                        'ssy': 3,
                        'st': 3,
                        'sv': 3,
                        'sw': 3,
                        'syr': 3,
                        'ta': 3,
                        'te': 3,
                        'teo': 3,
                        'th': 0,
                        'ti': 4,
                        'tig': 3,
                        'tk': 3,
                        'tl': 4,
                        'tn': 3,
                        'to': 0,
                        'tr': 0,
                        'ts': 3,
                        'tzm': 22,
                        'uk': 11,
                        'ur': 3,
                        've': 3,
                        'vi': 0,
                        'vun': 3,
                        'wa': 4,
                        'wae': 3,
                        'wo': 0,
                        'xh': 3,
                        'xog': 3,
                        'yo': 0,
                        'zh': 0,
                        'zu': 3
                    };

                    function isIn(n, list) {
                        return list.indexOf(n) !== -1;
                    }

                    function isBetween(n, start, end) {
                        return start <= n && n <= end;
                    }

                    var pluralRules = {
                        '0': function (n) {
                            return 'other';
                        },
                        '1': function (n) {
                            if (isBetween(n % 100, 3, 10)) return 'few';
                            if (n === 0) return 'zero';
                            if (isBetween(n % 100, 11, 99)) return 'many';
                            if (n == 2) return 'two';
                            if (n == 1) return 'one';
                            return 'other';
                        },
                        '2': function (n) {
                            if (n !== 0 && n % 10 === 0) return 'many';
                            if (n == 2) return 'two';
                            if (n == 1) return 'one';
                            return 'other';
                        },
                        '3': function (n) {
                            if (n == 1) return 'one';
                            return 'other';
                        },
                        '4': function (n) {
                            if (isBetween(n, 0, 1)) return 'one';
                            return 'other';
                        },
                        '5': function (n) {
                            if (isBetween(n, 0, 2) && n != 2) return 'one';
                            return 'other';
                        },
                        '6': function (n) {
                            if (n === 0) return 'zero';
                            if (n % 10 == 1 && n % 100 != 11) return 'one';
                            return 'other';
                        },
                        '7': function (n) {
                            if (n == 2) return 'two';
                            if (n == 1) return 'one';
                            return 'other';
                        },
                        '8': function (n) {
                            if (isBetween(n, 3, 6)) return 'few';
                            if (isBetween(n, 7, 10)) return 'many';
                            if (n == 2) return 'two';
                            if (n == 1) return 'one';
                            return 'other';
                        },
                        '9': function (n) {
                            if (n === 0 || n != 1 && isBetween(n % 100, 1, 19)) return 'few';
                            if (n == 1) return 'one';
                            return 'other';
                        },
                        '10': function (n) {
                            if (isBetween(n % 10, 2, 9) && !isBetween(n % 100, 11, 19)) return 'few';
                            if (n % 10 == 1 && !isBetween(n % 100, 11, 19)) return 'one';
                            return 'other';
                        },
                        '11': function (n) {
                            if (isBetween(n % 10, 2, 4) && !isBetween(n % 100, 12, 14)) return 'few';
                            if (n % 10 === 0 || isBetween(n % 10, 5, 9) || isBetween(n % 100, 11, 14)) return 'many';
                            if (n % 10 == 1 && n % 100 != 11) return 'one';
                            return 'other';
                        },
                        '12': function (n) {
                            if (isBetween(n, 2, 4)) return 'few';
                            if (n == 1) return 'one';
                            return 'other';
                        },
                        '13': function (n) {
                            if (isBetween(n % 10, 2, 4) && !isBetween(n % 100, 12, 14)) return 'few';
                            if (n != 1 && isBetween(n % 10, 0, 1) || isBetween(n % 10, 5, 9) || isBetween(n % 100, 12, 14)) return 'many';
                            if (n == 1) return 'one';
                            return 'other';
                        },
                        '14': function (n) {
                            if (isBetween(n % 100, 3, 4)) return 'few';
                            if (n % 100 == 2) return 'two';
                            if (n % 100 == 1) return 'one';
                            return 'other';
                        },
                        '15': function (n) {
                            if (n === 0 || isBetween(n % 100, 2, 10)) return 'few';
                            if (isBetween(n % 100, 11, 19)) return 'many';
                            if (n == 1) return 'one';
                            return 'other';
                        },
                        '16': function (n) {
                            if (n % 10 == 1 && n != 11) return 'one';
                            return 'other';
                        },
                        '17': function (n) {
                            if (n == 3) return 'few';
                            if (n === 0) return 'zero';
                            if (n == 6) return 'many';
                            if (n == 2) return 'two';
                            if (n == 1) return 'one';
                            return 'other';
                        },
                        '18': function (n) {
                            if (n === 0) return 'zero';
                            if (isBetween(n, 0, 2) && n !== 0 && n != 2) return 'one';
                            return 'other';
                        },
                        '19': function (n) {
                            if (isBetween(n, 2, 10)) return 'few';
                            if (isBetween(n, 0, 1)) return 'one';
                            return 'other';
                        },
                        '20': function (n) {
                            if ((isBetween(n % 10, 3, 4) || n % 10 == 9) && !(isBetween(n % 100, 10, 19) || isBetween(n % 100, 70, 79) || isBetween(n % 100, 90, 99))) return 'few';
                            if (n % 1000000 === 0 && n !== 0) return 'many';
                            if (n % 10 == 2 && !isIn(n % 100, [12, 72, 92])) return 'two';
                            if (n % 10 == 1 && !isIn(n % 100, [11, 71, 91])) return 'one';
                            return 'other';
                        },
                        '21': function (n) {
                            if (n === 0) return 'zero';
                            if (n == 1) return 'one';
                            return 'other';
                        },
                        '22': function (n) {
                            if (isBetween(n, 0, 1) || isBetween(n, 11, 99)) return 'one';
                            return 'other';
                        },
                        '23': function (n) {
                            if (isBetween(n % 10, 1, 2) || n % 20 === 0) return 'one';
                            return 'other';
                        },
                        '24': function (n) {
                            if (isBetween(n, 3, 10) || isBetween(n, 13, 19)) return 'few';
                            if (isIn(n, [2, 12])) return 'two';
                            if (isIn(n, [1, 11])) return 'one';
                            return 'other';
                        }
                    };
                    var index = locales2rules[lang.replace(/-.*$/, '')];
                    if (!(index in pluralRules)) {
                        console.warn('plural form unknown for [' + lang + ']');
                        return function () {
                            return 'other';
                        };
                    }
                    return pluralRules[index];
                }

                gMacros.plural = function (str, param, key, prop) {
                    var n = parseFloat(param);
                    if (isNaN(n)) return str;
                    if (prop != gTextProp) return str;
                    if (!gMacros._pluralRules) {
                        gMacros._pluralRules = getPluralRules(gLanguage);
                    }
                    var index = '[' + gMacros._pluralRules(n) + ']';
                    if (n === 0 && key + '[zero]' in gL10nData) {
                        str = gL10nData[key + '[zero]'][prop];
                    } else if (n == 1 && key + '[one]' in gL10nData) {
                        str = gL10nData[key + '[one]'][prop];
                    } else if (n == 2 && key + '[two]' in gL10nData) {
                        str = gL10nData[key + '[two]'][prop];
                    } else if (key + index in gL10nData) {
                        str = gL10nData[key + index][prop];
                    } else if (key + '[other]' in gL10nData) {
                        str = gL10nData[key + '[other]'][prop];
                    }
                    return str;
                };

                function getL10nData(key, args, fallback) {
                    var data = gL10nData[key];
                    if (!data) {
                        console.warn('#' + key + ' is undefined.');
                        if (!fallback) {
                            return null;
                        }
                        data = fallback;
                    }
                    var rv = {};
                    for (var prop in data) {
                        var str = data[prop];
                        str = substIndexes(str, args, key, prop);
                        str = substArguments(str, args, key);
                        rv[prop] = str;
                    }
                    return rv;
                }

                function substIndexes(str, args, key, prop) {
                    var reIndex = /\{\[\s*([a-zA-Z]+)\(([a-zA-Z]+)\)\s*\]\}/;
                    var reMatch = reIndex.exec(str);
                    if (!reMatch || !reMatch.length) return str;
                    var macroName = reMatch[1];
                    var paramName = reMatch[2];
                    var param;
                    if (args && paramName in args) {
                        param = args[paramName];
                    } else if (paramName in gL10nData) {
                        param = gL10nData[paramName];
                    }
                    if (macroName in gMacros) {
                        var macro = gMacros[macroName];
                        str = macro(str, param, key, prop);
                    }
                    return str;
                }

                function substArguments(str, args, key) {
                    var reArgs = /\{\{\s*(.+?)\s*\}\}/g;
                    return str.replace(reArgs, function (matched_text, arg) {
                        if (args && arg in args) {
                            return args[arg];
                        }
                        if (arg in gL10nData) {
                            return gL10nData[arg];
                        }
                        console.log('argument {{' + arg + '}} for #' + key + ' is undefined.');
                        return matched_text;
                    });
                }

                function translateElement(element) {
                    var l10n = getL10nAttributes(element);
                    if (!l10n.id) return;
                    var data = getL10nData(l10n.id, l10n.args);
                    if (!data) {
                        console.warn('#' + l10n.id + ' is undefined.');
                        return;
                    }
                    if (data[gTextProp]) {
                        if (getChildElementCount(element) === 0) {
                            element[gTextProp] = data[gTextProp];
                        } else {
                            var children = element.childNodes;
                            var found = false;
                            for (var i = 0, l = children.length; i < l; i++) {
                                if (children[i].nodeType === 3 && /\S/.test(children[i].nodeValue)) {
                                    if (found) {
                                        children[i].nodeValue = '';
                                    } else {
                                        children[i].nodeValue = data[gTextProp];
                                        found = true;
                                    }
                                }
                            }
                            if (!found) {
                                var textNode = document.createTextNode(data[gTextProp]);
                                element.prepend(textNode);
                            }
                        }
                        delete data[gTextProp];
                    }
                    for (var k in data) {
                        element[k] = data[k];
                    }
                }

                function getChildElementCount(element) {
                    if (element.children) {
                        return element.children.length;
                    }
                    if (typeof element.childElementCount !== 'undefined') {
                        return element.childElementCount;
                    }
                    var count = 0;
                    for (var i = 0; i < element.childNodes.length; i++) {
                        count += element.nodeType === 1 ? 1 : 0;
                    }
                    return count;
                }

                function translateFragment(element) {
                    element = element || document.documentElement;
                    var children = getTranslatableChildren(element);
                    var elementCount = children.length;
                    for (var i = 0; i < elementCount; i++) {
                        translateElement(children[i]);
                    }
                    translateElement(element);
                }

                return {
                    get: function (key, args, fallbackString) {
                        var index = key.lastIndexOf('.');
                        var prop = gTextProp;
                        if (index > 0) {
                            prop = key.substring(index + 1);
                            key = key.substring(0, index);
                        }
                        var fallback;
                        if (fallbackString) {
                            fallback = {};
                            fallback[prop] = fallbackString;
                        }
                        var data = getL10nData(key, args, fallback);
                        if (data && prop in data) {
                            return data[prop];
                        }
                        return '{{' + key + '}}';
                    },
                    getData: function () {
                        return gL10nData;
                    },
                    getText: function () {
                        return gTextData;
                    },
                    getLanguage: function () {
                        return gLanguage;
                    },
                    setLanguage: function (lang, callback) {
                        loadLocale(lang, function () {
                            if (callback) callback();
                        });
                    },
                    getDirection: function () {
                        var rtlList = ['ar', 'he', 'fa', 'ps', 'ur'];
                        var shortCode = gLanguage.split('-', 1)[0];
                        return rtlList.indexOf(shortCode) >= 0 ? 'rtl' : 'ltr';
                    },
                    translate: translateFragment,
                    getReadyState: function () {
                        return gReadyState;
                    },
                    ready: function (callback) {
                        if (!callback) {
                            return;
                        } else if (gReadyState == 'complete' || gReadyState == 'interactive') {
                            window.setTimeout(function () {
                                callback();
                            });
                        } else if (document.addEventListener) {
                            document.addEventListener('localized', function once() {
                                document.removeEventListener('localized', once);
                                callback();
                            });
                        }
                    }
                };
            }(window, document);

            /***/
        }),
        /* 46 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.GenericScripting = void 0;
            exports.docProperties = docProperties;
            var _pdfjsLib = __webpack_require__(4);

            async function docProperties(pdfDocument) {
                const url = "",
                    baseUrl = url.split("#")[0];
                let {
                    info,
                    metadata,
                    contentDispositionFilename,
                    contentLength
                } = await pdfDocument.getMetadata();
                if (!contentLength) {
                    const {
                        length
                    } = await pdfDocument.getDownloadInfo();
                    contentLength = length;
                }
                return {
                    ...info,
                    baseURL: baseUrl,
                    filesize: contentLength,
                    filename: contentDispositionFilename || (0, _pdfjsLib.getPdfFilenameFromUrl)(url),
                    metadata: metadata?.getRaw(),
                    authors: metadata?.get("dc:creator"),
                    numPages: pdfDocument.numPages,
                    URL: url
                };
            }

            class GenericScripting {
                constructor(sandboxBundleSrc) {
                    this._ready = (0, _pdfjsLib.loadScript)(sandboxBundleSrc, true).then(() => {
                        return window.pdfjsSandbox.QuickJSSandbox();
                    });
                }

                async createSandbox(data) {
                    const sandbox = await this._ready;
                    sandbox.create(data);
                }

                async dispatchEventInSandbox(event) {
                    const sandbox = await this._ready;
                    setTimeout(() => sandbox.dispatchEvent(event), 0);
                }

                async destroySandbox() {
                    const sandbox = await this._ready;
                    sandbox.nukeSandbox();
                }
            }

            exports.GenericScripting = GenericScripting;

            /***/
        }),
        /* 47 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.PDFPrintService = void 0;
            var _pdfjsLib = __webpack_require__(4);
            var _app = __webpack_require__(2);
            var _print_utils = __webpack_require__(48);
            let activeService = null;
            let dialog = null;
            let overlayManager = null;

            function renderPage(activeServiceOnEntry, pdfDocument, pageNumber, size, printResolution, optionalContentConfigPromise, printAnnotationStoragePromise) {
                const scratchCanvas = activeService.scratchCanvas;
                const PRINT_UNITS = printResolution / _pdfjsLib.PixelsPerInch.PDF;
                scratchCanvas.width = Math.floor(size.width * PRINT_UNITS);
                scratchCanvas.height = Math.floor(size.height * PRINT_UNITS);
                const ctx = scratchCanvas.getContext("2d");
                ctx.save();
                ctx.fillStyle = "rgb(255, 255, 255)";
                ctx.fillRect(0, 0, scratchCanvas.width, scratchCanvas.height);
                ctx.restore();
                return Promise.all([pdfDocument.getPage(pageNumber), printAnnotationStoragePromise]).then(function ([pdfPage, printAnnotationStorage]) {
                    const renderContext = {
                        canvasContext: ctx,
                        transform: [PRINT_UNITS, 0, 0, PRINT_UNITS, 0, 0],
                        viewport: pdfPage.getViewport({
                            scale: 1,
                            rotation: size.rotation
                        }),
                        intent: "print",
                        annotationMode: _pdfjsLib.AnnotationMode.ENABLE_STORAGE,
                        optionalContentConfigPromise,
                        printAnnotationStorage
                    };
                    return pdfPage.render(renderContext).promise;
                });
            }

            class PDFPrintService {
                constructor(pdfDocument, pagesOverview, printContainer, printResolution, optionalContentConfigPromise = null, printAnnotationStoragePromise = null, l10n) {
                    this.pdfDocument = pdfDocument;
                    this.pagesOverview = pagesOverview;
                    this.printContainer = printContainer;
                    this._printResolution = printResolution || 150;
                    this._optionalContentConfigPromise = optionalContentConfigPromise || pdfDocument.getOptionalContentConfig();
                    this._printAnnotationStoragePromise = printAnnotationStoragePromise || Promise.resolve();
                    this.l10n = l10n;
                    this.currentPage = -1;
                    this.scratchCanvas = document.createElement("canvas");
                }

                layout() {
                    this.throwIfInactive();
                    const body = document.querySelector("body");
                    body.setAttribute("data-pdfjsprinting", true);
                    const {
                        width,
                        height
                    } = this.pagesOverview[0];
                    const hasEqualPageSizes = this.pagesOverview.every(size => size.width === width && size.height === height);
                    if (!hasEqualPageSizes) {
                        console.warn("Not all pages have the same size. The printed result may be incorrect!");
                    }
                    this.pageStyleSheet = document.createElement("style");
                    this.pageStyleSheet.textContent = `@page { size: ${width}pt ${height}pt;}`;
                    body.append(this.pageStyleSheet);
                }

                destroy() {
                    if (activeService !== this) {
                        return;
                    }
                    this.printContainer.textContent = "";
                    const body = document.querySelector("body");
                    body.removeAttribute("data-pdfjsprinting");
                    if (this.pageStyleSheet) {
                        this.pageStyleSheet.remove();
                        this.pageStyleSheet = null;
                    }
                    this.scratchCanvas.width = this.scratchCanvas.height = 0;
                    this.scratchCanvas = null;
                    activeService = null;
                    ensureOverlay().then(function () {
                        if (overlayManager.active === dialog) {
                            overlayManager.close(dialog);
                        }
                    });
                }

                renderPages() {
                    if (this.pdfDocument.isPureXfa) {
                        (0, _print_utils.getXfaHtmlForPrinting)(this.printContainer, this.pdfDocument);
                        return Promise.resolve();
                    }
                    const pageCount = this.pagesOverview.length;
                    const renderNextPage = (resolve, reject) => {
                        this.throwIfInactive();
                        if (++this.currentPage >= pageCount) {
                            renderProgress(pageCount, pageCount, this.l10n);
                            resolve();
                            return;
                        }
                        const index = this.currentPage;
                        renderProgress(index, pageCount, this.l10n);
                        renderPage(this, this.pdfDocument, index + 1, this.pagesOverview[index], this._printResolution, this._optionalContentConfigPromise, this._printAnnotationStoragePromise).then(this.useRenderedPage.bind(this)).then(function () {
                            renderNextPage(resolve, reject);
                        }, reject);
                    };
                    return new Promise(renderNextPage);
                }

                useRenderedPage() {
                    this.throwIfInactive();
                    const img = document.createElement("img");
                    const scratchCanvas = this.scratchCanvas;
                    if ("toBlob" in scratchCanvas) {
                        scratchCanvas.toBlob(function (blob) {
                            img.src = URL.createObjectURL(blob);
                        });
                    } else {
                        img.src = scratchCanvas.toDataURL();
                    }
                    const wrapper = document.createElement("div");
                    wrapper.className = "printedPage";
                    wrapper.append(img);
                    this.printContainer.append(wrapper);
                    return new Promise(function (resolve, reject) {
                        img.onload = resolve;
                        img.onerror = reject;
                    });
                }

                performPrint() {
                    this.throwIfInactive();
                    return new Promise(resolve => {
                        setTimeout(() => {
                            if (!this.active) {
                                resolve();
                                return;
                            }
                            print.call(window);
                            setTimeout(resolve, 20);
                        }, 0);
                    });
                }

                get active() {
                    return this === activeService;
                }

                throwIfInactive() {
                    if (!this.active) {
                        throw new Error("This print request was cancelled or completed.");
                    }
                }
            }

            exports.PDFPrintService = PDFPrintService;
            const print = window.print;
            window.print = function () {
                if (activeService) {
                    console.warn("Ignored window.print() because of a pending print job.");
                    return;
                }
                ensureOverlay().then(function () {
                    if (activeService) {
                        overlayManager.open(dialog);
                    }
                });
                try {
                    dispatchEvent("beforeprint");
                } finally {
                    if (!activeService) {
                        console.error("Expected print service to be initialized.");
                        ensureOverlay().then(function () {
                            if (overlayManager.active === dialog) {
                                overlayManager.close(dialog);
                            }
                        });
                        return;
                    }
                    const activeServiceOnEntry = activeService;
                    activeService.renderPages().then(function () {
                        return activeServiceOnEntry.performPrint();
                    }).catch(function () {
                    }).then(function () {
                        if (activeServiceOnEntry.active) {
                            abort();
                        }
                    });
                }
            };

            function dispatchEvent(eventType) {
                const event = new CustomEvent(eventType, {
                    bubbles: false,
                    cancelable: false,
                    detail: "custom"
                });
                window.dispatchEvent(event);
            }

            function abort() {
                if (activeService) {
                    activeService.destroy();
                    dispatchEvent("afterprint");
                }
            }

            function renderProgress(index, total, l10n) {
                dialog ||= document.getElementById("printServiceDialog");
                const progress = Math.round(100 * index / total);
                const progressBar = dialog.querySelector("progress");
                const progressPerc = dialog.querySelector(".relative-progress");
                progressBar.value = progress;
                l10n.get("print_progress_percent", {
                    progress
                }).then(msg => {
                    progressPerc.textContent = msg;
                });
            }

            window.addEventListener("keydown", function (event) {
                if (event.keyCode === 80 && (event.ctrlKey || event.metaKey) && !event.altKey && (!event.shiftKey || window.chrome || window.opera)) {
                    window.print();
                    event.preventDefault();
                    event.stopImmediatePropagation();
                }
            }, true);
            if ("onbeforeprint" in window) {
                const stopPropagationIfNeeded = function (event) {
                    if (event.detail !== "custom") {
                        event.stopImmediatePropagation();
                    }
                };
                window.addEventListener("beforeprint", stopPropagationIfNeeded);
                window.addEventListener("afterprint", stopPropagationIfNeeded);
            }
            let overlayPromise;

            function ensureOverlay() {
                if (!overlayPromise) {
                    overlayManager = _app.PDFViewerApplication.overlayManager;
                    if (!overlayManager) {
                        throw new Error("The overlay manager has not yet been initialized.");
                    }
                    dialog ||= document.getElementById("printServiceDialog");
                    overlayPromise = overlayManager.register(dialog, true);
                    document.getElementById("printCancel").onclick = abort;
                    dialog.addEventListener("close", abort);
                }
                return overlayPromise;
            }

            _app.PDFPrintServiceFactory.instance = {
                supportsPrinting: true,
                createPrintService(pdfDocument, pagesOverview, printContainer, printResolution, optionalContentConfigPromise, printAnnotationStoragePromise, l10n) {
                    if (activeService) {
                        throw new Error("The print service is created and active.");
                    }
                    activeService = new PDFPrintService(pdfDocument, pagesOverview, printContainer, printResolution, optionalContentConfigPromise, printAnnotationStoragePromise, l10n);
                    return activeService;
                }
            };

            /***/
        }),
        /* 48 */
        /***/ ((__unused_webpack_module, exports, __webpack_require__) => {


            Object.defineProperty(exports, "__esModule", ({
                value: true
            }));
            exports.getXfaHtmlForPrinting = getXfaHtmlForPrinting;
            var _pdfjsLib = __webpack_require__(4);
            var _pdf_link_service = __webpack_require__(7);
            var _xfa_layer_builder = __webpack_require__(38);

            function getXfaHtmlForPrinting(printContainer, pdfDocument) {
                const xfaHtml = pdfDocument.allXfaHtml;
                const linkService = new _pdf_link_service.SimpleLinkService();
                const scale = Math.round(_pdfjsLib.PixelsPerInch.PDF_TO_CSS_UNITS * 100) / 100;
                for (const xfaPage of xfaHtml.children) {
                    const page = document.createElement("div");
                    page.className = "xfaPrintedPage";
                    printContainer.append(page);
                    const builder = new _xfa_layer_builder.XfaLayerBuilder({
                        pageDiv: page,
                        pdfPage: null,
                        annotationStorage: pdfDocument.annotationStorage,
                        linkService,
                        xfaHtml: xfaPage
                    });
                    const viewport = (0, _pdfjsLib.getXfaPageViewport)(xfaPage, {
                        scale
                    });
                    builder.render(viewport, "print");
                }
            }

            /***/
        })
        /******/]);
    /************************************************************************/
    /******/ 	// The module cache
    /******/
    var __webpack_module_cache__ = {};
    /******/
    /******/ 	// The require function
    /******/
    function __webpack_require__(moduleId) {
        /******/ 		// Check if module is in cache
        /******/
        var cachedModule = __webpack_module_cache__[moduleId];
        /******/
        if (cachedModule !== undefined) {
            /******/
            return cachedModule.exports;
            /******/
        }
        /******/ 		// Create a new module (and put it into the cache)
        /******/
        var module = __webpack_module_cache__[moduleId] = {
            /******/ 			// no module.id needed
            /******/ 			// no module.loaded needed
            /******/            exports: {}
            /******/
        };
        /******/
        /******/ 		// Execute the module function
        /******/
        __webpack_modules__[moduleId](module, module.exports, __webpack_require__);
        /******/
        /******/ 		// Return the exports of the module
        /******/
        return module.exports;
        /******/
    }

    /******/
    /************************************************************************/
    var __webpack_exports__ = {};
// This entry need to be wrapped in an IIFE because it need to be isolated against other modules in the chunk.
    (() => {
        var exports = __webpack_exports__;


        Object.defineProperty(exports, "__esModule", ({
            value: true
        }));
        Object.defineProperty(exports, "PDFViewerApplication", ({
            enumerable: true,
            get: function () {
                return _app.PDFViewerApplication;
            }
        }));
        exports.PDFViewerApplicationConstants = void 0;
        Object.defineProperty(exports, "PDFViewerApplicationOptions", ({
            enumerable: true,
            get: function () {
                return _app_options.AppOptions;
            }
        }));
        __webpack_require__(1);
        __webpack_require__(47);
        var _ui_utils = __webpack_require__(3);
        var _app_options = __webpack_require__(5);
        var _pdf_link_service = __webpack_require__(7);
        var _app = __webpack_require__(2);
        const pdfjsVersion = '3.11.174';
        const pdfjsBuild = 'ce8716743';
        const AppConstants = {
            LinkTarget: _pdf_link_service.LinkTarget,
            RenderingStates: _ui_utils.RenderingStates,
            ScrollMode: _ui_utils.ScrollMode,
            SpreadMode: _ui_utils.SpreadMode
        };
        exports.PDFViewerApplicationConstants = AppConstants;
        window.PDFViewerApplication = _app.PDFViewerApplication;
        window.PDFViewerApplicationConstants = AppConstants;
        window.PDFViewerApplicationOptions = _app_options.AppOptions;

        function getViewerConfiguration() {
            return {
                appContainer: document.body,
                mainContainer: document.getElementById("viewerContainer"),
                viewerContainer: document.getElementById("viewer"),
                toolbar: {
                    container: document.getElementById("toolbarViewer"),
                    numPages: document.getElementById("numPages"),
                    pageNumber: document.getElementById("pageNumber"),
                    scaleSelect: document.getElementById("scaleSelect"),
                    customScaleOption: document.getElementById("customScaleOption"),
                    previous: document.getElementById("previous"),
                    next: document.getElementById("next"),
                    zoomIn: document.getElementById("zoomIn"),
                    zoomOut: document.getElementById("zoomOut"),
                    viewFind: document.getElementById("viewFind"),
                    openFile: document.getElementById("openFile"),
                    print: document.getElementById("print"),
                    editorFreeTextButton: document.getElementById("editorFreeText"),
                    editorFreeTextParamsToolbar: document.getElementById("editorFreeTextParamsToolbar"),
                    editorInkButton: document.getElementById("editorInk"),
                    editorInkParamsToolbar: document.getElementById("editorInkParamsToolbar"),
                    editorStampButton: document.getElementById("editorStamp"),
                    editorStampParamsToolbar: document.getElementById("editorStampParamsToolbar"),
                    download: document.getElementById("download")
                },
                secondaryToolbar: {
                    toolbar: document.getElementById("secondaryToolbar"),
                    toggleButton: document.getElementById("secondaryToolbarToggle"),
                    presentationModeButton: document.getElementById("presentationMode"),
                    openFileButton: document.getElementById("secondaryOpenFile"),
                    printButton: document.getElementById("secondaryPrint"),
                    downloadButton: document.getElementById("secondaryDownload"),
                    viewBookmarkButton: document.getElementById("viewBookmark"),
                    firstPageButton: document.getElementById("firstPage"),
                    lastPageButton: document.getElementById("lastPage"),
                    pageRotateCwButton: document.getElementById("pageRotateCw"),
                    pageRotateCcwButton: document.getElementById("pageRotateCcw"),
                    cursorSelectToolButton: document.getElementById("cursorSelectTool"),
                    cursorHandToolButton: document.getElementById("cursorHandTool"),
                    scrollPageButton: document.getElementById("scrollPage"),
                    scrollVerticalButton: document.getElementById("scrollVertical"),
                    scrollHorizontalButton: document.getElementById("scrollHorizontal"),
                    scrollWrappedButton: document.getElementById("scrollWrapped"),
                    spreadNoneButton: document.getElementById("spreadNone"),
                    spreadOddButton: document.getElementById("spreadOdd"),
                    spreadEvenButton: document.getElementById("spreadEven"),
                    documentPropertiesButton: document.getElementById("documentProperties")
                },
                sidebar: {
                    outerContainer: document.getElementById("outerContainer"),
                    sidebarContainer: document.getElementById("sidebarContainer"),
                    toggleButton: document.getElementById("sidebarToggle"),
                    resizer: document.getElementById("sidebarResizer"),
                    thumbnailButton: document.getElementById("viewThumbnail"),
                    outlineButton: document.getElementById("viewOutline"),
                    attachmentsButton: document.getElementById("viewAttachments"),
                    layersButton: document.getElementById("viewLayers"),
                    thumbnailView: document.getElementById("thumbnailView"),
                    outlineView: document.getElementById("outlineView"),
                    attachmentsView: document.getElementById("attachmentsView"),
                    layersView: document.getElementById("layersView"),
                    outlineOptionsContainer: document.getElementById("outlineOptionsContainer"),
                    currentOutlineItemButton: document.getElementById("currentOutlineItem")
                },
                findBar: {
                    bar: document.getElementById("findbar"),
                    toggleButton: document.getElementById("viewFind"),
                    findField: document.getElementById("findInput"),
                    highlightAllCheckbox: document.getElementById("findHighlightAll"),
                    caseSensitiveCheckbox: document.getElementById("findMatchCase"),
                    matchDiacriticsCheckbox: document.getElementById("findMatchDiacritics"),
                    entireWordCheckbox: document.getElementById("findEntireWord"),
                    findMsg: document.getElementById("findMsg"),
                    findResultsCount: document.getElementById("findResultsCount"),
                    findPreviousButton: document.getElementById("findPrevious"),
                    findNextButton: document.getElementById("findNext")
                },
                passwordOverlay: {
                    dialog: document.getElementById("passwordDialog"),
                    label: document.getElementById("passwordText"),
                    input: document.getElementById("password"),
                    submitButton: document.getElementById("passwordSubmit"),
                    cancelButton: document.getElementById("passwordCancel")
                },
                documentProperties: {
                    dialog: document.getElementById("documentPropertiesDialog"),
                    closeButton: document.getElementById("documentPropertiesClose"),
                    fields: {
                        fileName: document.getElementById("fileNameField"),
                        fileSize: document.getElementById("fileSizeField"),
                        title: document.getElementById("titleField"),
                        author: document.getElementById("authorField"),
                        subject: document.getElementById("subjectField"),
                        keywords: document.getElementById("keywordsField"),
                        creationDate: document.getElementById("creationDateField"),
                        modificationDate: document.getElementById("modificationDateField"),
                        creator: document.getElementById("creatorField"),
                        producer: document.getElementById("producerField"),
                        version: document.getElementById("versionField"),
                        pageCount: document.getElementById("pageCountField"),
                        pageSize: document.getElementById("pageSizeField"),
                        linearized: document.getElementById("linearizedField")
                    }
                },
                altTextDialog: {
                    dialog: document.getElementById("altTextDialog"),
                    optionDescription: document.getElementById("descriptionButton"),
                    optionDecorative: document.getElementById("decorativeButton"),
                    textarea: document.getElementById("descriptionTextarea"),
                    cancelButton: document.getElementById("altTextCancel"),
                    saveButton: document.getElementById("altTextSave")
                },
                annotationEditorParams: {
                    editorFreeTextFontSize: document.getElementById("editorFreeTextFontSize"),
                    editorFreeTextColor: document.getElementById("editorFreeTextColor"),
                    editorInkColor: document.getElementById("editorInkColor"),
                    editorInkThickness: document.getElementById("editorInkThickness"),
                    editorInkOpacity: document.getElementById("editorInkOpacity"),
                    editorStampAddImage: document.getElementById("editorStampAddImage")
                },
                printContainer: document.getElementById("printContainer"),
                openFileInput: document.getElementById("fileInput"),
                debuggerScriptPath: "./debugger.js"
            };
        }

        function webViewerLoad() {
            const config = getViewerConfiguration();
            const event = new CustomEvent("webviewerloaded", {
                bubbles: true,
                cancelable: true,
                detail: {
                    source: window
                }
            });
            try {
                parent.document.dispatchEvent(event);
            } catch (ex) {
                console.error(`webviewerloaded: ${ex}`);
                document.dispatchEvent(event);
            }
            _app.PDFViewerApplication.run(config);
        }

        document.blockUnblockOnload?.(true);
        if (document.readyState === "interactive" || document.readyState === "complete") {
            webViewerLoad();
        } else {
            document.addEventListener("DOMContentLoaded", webViewerLoad, true);
        }
    })();

    /******/
})()
;
//# sourceMappingURL=viewer.js.map