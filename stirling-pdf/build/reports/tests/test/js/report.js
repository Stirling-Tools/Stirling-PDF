(function (window, document) {
    "use strict";

    function changeElementClass(element, classValue) {
        if (element.getAttribute("className")) {
            element.setAttribute("className", classValue);
        } else {
            element.setAttribute("class", classValue);
        }
    }

    function getClassAttribute(element) {
        if (element.getAttribute("className")) {
            return element.getAttribute("className");
        } else {
            return element.getAttribute("class");
        }
    }

    function addClass(element, classValue) {
        changeElementClass(element, getClassAttribute(element) + " " + classValue);
    }

    function removeClass(element, classValue) {
        changeElementClass(element, getClassAttribute(element).replace(classValue, ""));
    }

    function getCheckBox() {
        return document.getElementById("line-wrapping-toggle");
    }

    function getLabelForCheckBox() {
        return document.getElementById("label-for-line-wrapping-toggle");
    }

    function findCodeBlocks() {
        const codeBlocks = [];
        const tabContainers = getTabContainers();
        for (let i = 0; i < tabContainers.length; i++) {
            const spans = tabContainers[i].getElementsByTagName("span");
            for (let i = 0; i < spans.length; ++i) {
                if (spans[i].className.indexOf("code") >= 0) {
                    codeBlocks.push(spans[i]);
                }
            }
        }
        return codeBlocks;
    }

    function forAllCodeBlocks(operation) {
        const codeBlocks = findCodeBlocks();

        for (let i = 0; i < codeBlocks.length; ++i) {
            operation(codeBlocks[i], "wrapped");
        }
    }

    function toggleLineWrapping() {
        const checkBox = getCheckBox();

        if (checkBox.checked) {
            forAllCodeBlocks(addClass);
        } else {
            forAllCodeBlocks(removeClass);
        }
    }

    function initControls() {
        if (findCodeBlocks().length > 0) {
            const checkBox = getCheckBox();
            const label = getLabelForCheckBox();

            checkBox.onclick = toggleLineWrapping;
            checkBox.checked = false;

            removeClass(label, "hidden");
         }
    }

    class TabManager {
        baseId;
        tabs;
        titles;
        headers;

        constructor(baseId, tabs, titles, headers) {
            this.baseId = baseId;
            this.tabs = tabs;
            this.titles = titles;
            this.headers = headers;
        }

        select(i) {
            this.deselectAll();

            changeElementClass(this.tabs[i], "tab selected");
            changeElementClass(this.headers[i], "selected");

            while (this.headers[i].firstChild) {
                this.headers[i].removeChild(this.headers[i].firstChild);
            }

            const a = document.createElement("a");

            a.appendChild(document.createTextNode(this.titles[i]));
            this.headers[i].appendChild(a);
        }

        deselectAll() {
            for (let i = 0; i < this.tabs.length; i++) {
                changeElementClass(this.tabs[i], "tab deselected");
                changeElementClass(this.headers[i], "deselected");

                while (this.headers[i].firstChild) {
                    this.headers[i].removeChild(this.headers[i].firstChild);
                }

                const a = document.createElement("a");

                const id = this.baseId + "-tab" + i;
                a.setAttribute("id", id);
                a.setAttribute("href", "#tab" + i);
                a.onclick = () => {
                    this.select(i);
                    return false;
                };
                a.appendChild(document.createTextNode(this.titles[i]));

                this.headers[i].appendChild(a);
            }
        }
    }

    function getTabContainers() {
        const tabContainers = Array.from(document.getElementsByClassName("tab-container"));

        // Used by existing TabbedPageRenderer users, which have not adjusted to use TabsRenderer yet.
        const legacyContainer = document.getElementById("tabs");
        if (legacyContainer) {
            tabContainers.push(legacyContainer);
        }

        return tabContainers;
    }

    function initTabs() {
        let tabGroups = 0;

        function createTab(num, container) {
            const tabElems = findTabs(container);
            const tabManager = new TabManager("tabs" + num, tabElems, findTitles(tabElems), findHeaders(container));
            tabManager.select(0);
        }

        const tabContainers = getTabContainers();

        for (let i = 0; i < tabContainers.length; i++) {
            createTab(tabGroups, tabContainers[i]);
            tabGroups++;
        }

        return true;
    }

    function findTabs(container) {
        return findChildElements(container, "DIV", "tab");
    }

    function findHeaders(container) {
        const owner = findChildElements(container, "UL", "tabLinks");
        return findChildElements(owner[0], "LI", null);
    }

    function findTitles(tabs) {
        const titles = [];

        for (let i = 0; i < tabs.length; i++) {
            const tab = tabs[i];
            const header = findChildElements(tab, "H2", null)[0];

            header.parentNode.removeChild(header);

            if (header.innerText) {
                titles.push(header.innerText);
            } else {
                titles.push(header.textContent);
            }
        }

        return titles;
    }

    function findChildElements(container, name, targetClass) {
        const elements = [];
        const children = container.childNodes;

        for (let i = 0; i < children.length; i++) {
            const child = children.item(i);

            if (child.nodeType === 1 && child.nodeName === name) {
                if (targetClass && child.className.indexOf(targetClass) < 0) {
                    continue;
                }

                elements.push(child);
            }
        }

        return elements;
    }

    // Entry point.

    window.onload = function() {
        initTabs();
        initControls();
    };
} (window, window.document));
