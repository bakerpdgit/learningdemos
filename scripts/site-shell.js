(() => {
  "use strict";

  const script = document.currentScript;
  const scriptUrl = script && script.src;
  const pageName = decodeURIComponent(location.pathname.split("/").pop() || "index.html").toLowerCase();
  const siteOnlyPages = new Set(["", "index.html", "about.html"]);
  let normalizing = false;
  let normalizeScheduled = false;
  let observer;

  function ensureLegacyThemeCompatibility() {
    if (document.getElementById("theme-toggle")) return;
    const host = document.createElement("div");
    host.className = "site-shell-legacy-theme-compat";
    host.hidden = true;
    host.setAttribute("aria-hidden", "true");
    host.innerHTML = '<button id="theme-toggle" type="button" tabindex="-1"><svg id="icon-sun" aria-hidden="true"></svg><svg id="icon-moon" aria-hidden="true"></svg></button>';
    (document.head || document.documentElement).appendChild(host);
  }

  function updatePageWidth() {
    document.documentElement.style.setProperty("--site-shell-page-width", `${document.documentElement.clientWidth}px`);
  }

  function ensureStylesheet() {
    if (document.querySelector('link[data-site-shell-styles], style[data-site-shell-styles]')) return;

    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.dataset.siteShellStyles = "";
    link.href = scriptUrl ? new URL("site-shell.css", scriptUrl).href : "scripts/site-shell.css";
    document.head.appendChild(link);
  }

  function cleanText(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function cleanTitle(value) {
    return cleanText(value)
      .replace(/^AQA\s+(?:A[- ]Level\s+)?(?:Computer Science|CS)\s*[:|\-–—]\s*/i, "")
      .replace(/^A[- ]Level\s+(?:Computer Science|CS|Maths?)\s*[:|\-–—]\s*/i, "")
      .replace(/\s*[|–—]\s*(?:AQA\s*)?(?:A[- ]Level\s*)?(?:CS|Computer Science|Maths?).*$/i, "")
      .replace(/\s*[|–—]\s*Interactive Learning.*$/i, "") || "Interactive Learning";
  }

  function isLegacySiteHeader(header) {
    if (header.matches("[data-site-header], [data-generated-interactive-header]")) return false;
    const text = cleanText(header.textContent);
    const hasBrand = /(?:<\s*)?CS(?:\s*>|\s)+.*Learning/i.test(text) || /CS\s*Learning/i.test(text);
    const hasHome = Array.from(header.querySelectorAll("a")).some((link) => /home/i.test(cleanText(link.textContent)));
    return hasBrand && hasHome;
  }

  function hideLegacySiteHeaders() {
    document.querySelectorAll("header").forEach((header) => {
      if (isLegacySiteHeader(header)) header.classList.add("site-shell-source-header");
    });
  }

  function isVisible(element) {
    if (!element || element.closest(".site-shell-source-header")) return false;
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }

  function isFilterControl(element) {
    if (
      !isVisible(element) ||
      element.hasAttribute("data-interactive-filter-proxy") ||
      element.matches(
        "[data-site-theme-toggle], [data-interactive-filter-apply], [data-interactive-filter-close]",
      )
    ) return false;
    const label = cleanText([
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.textContent
    ].filter(Boolean).join(" "));
    return label.length <= 100 && /\b(filter|(?:sub-?)?topics?|categories)\b/i.test(label);
  }

  function findFilterControl(scope = document) {
    return Array.from(scope.querySelectorAll('button, [role="button"], summary'))
      .find(isFilterControl) || null;
  }

  function standardizeFilterTrigger(filter) {
    if (!filter) return;
    filter.classList.add("interactive-shell-control");
    filter.dataset.interactiveFilter = "";
    filter.setAttribute("aria-label", "Filter Topics");

    const standardLabelPattern = /^(?:(?:(?:filter|question)\s+)?(?:sub-?)?topics?(?:\s*\([^)]*\))?|categories)$/i;
    const textElements = Array.from(filter.querySelectorAll("span, strong, b"));
    const labelElement = textElements.find((element) => standardLabelPattern.test(cleanText(element.textContent)));
    if (labelElement) {
      if (cleanText(labelElement.textContent) !== "Filter Topics") labelElement.textContent = "Filter Topics";
      return;
    }

    const directLabel = Array.from(filter.childNodes).find((node) => (
      node.nodeType === Node.TEXT_NODE && standardLabelPattern.test(cleanText(node.textContent))
    ));
    if (directLabel) {
      if (cleanText(directLabel.textContent) !== "Filter Topics") directLabel.textContent = "Filter Topics";
      return;
    }

    if (!/filter\s+topics/i.test(cleanText(filter.textContent))) {
      const label = document.createElement("span");
      label.dataset.interactiveFilterLabel = "";
      label.textContent = "Filter Topics";
      filter.appendChild(label);
    }
  }

  function titleWords(value) {
    return new Set(cleanTitle(value).toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 2));
  }

  function titleSimilarity(left, right) {
    const a = titleWords(left);
    const b = titleWords(right);
    if (!a.size || !b.size) return 0;
    let matches = 0;
    a.forEach((word) => {
      if (b.has(word)) matches += 1;
    });
    return matches / Math.min(a.size, b.size);
  }

  function findTitleHeading(scope = document) {
    const pageTitle = cleanTitle(document.title);
    const headings = Array.from(scope.querySelectorAll("h1, h2, [role=heading]"))
      .filter(isVisible)
      .filter((heading) => !/quiz complete|well done|correct answer|question \d+/i.test(cleanText(heading.textContent)));

    return headings.sort((left, right) => {
      const similarityDifference = titleSimilarity(right.textContent, pageTitle) - titleSimilarity(left.textContent, pageTitle);
      if (Math.abs(similarityDifference) > 0.05) return similarityDifference;
      return left.getBoundingClientRect().top - right.getBoundingClientRect().top;
    })[0] || null;
  }

  function scoreHeader(header, pageTitle) {
    if (!isVisible(header) || isLegacySiteHeader(header)) return -1;
    const rect = header.getBoundingClientRect();
    let score = 0;
    if (header.hasAttribute("data-interactive-header")) score += 1000;
    if (findFilterControl(header)) score += 120;
    const heading = findTitleHeading(header);
    if (heading) score += 55 + (titleSimilarity(heading.textContent, pageTitle) * 50);
    const headerText = cleanText(header.textContent);
    const textSimilarity = titleSimilarity(headerText, pageTitle);
    if (headerText.length >= 3 && headerText.length <= 180) score += 18;
    if (textSimilarity >= 0.35) score += 35 + (textSimilarity * 35);
    if (rect.top < 500) score += 20;
    if (header.querySelector("nav") && !heading && !findFilterControl(header)) score -= 80;
    return score;
  }

  function findInteractiveHeader() {
    const normalized = Array.from(document.querySelectorAll("[data-interactive-shell-ready]"))
      .find((element) => isVisible(element) && !element.matches("[data-site-header], [data-generated-interactive-header]"));
    if (normalized) return normalized;

    const authored = document.querySelector("[data-interactive-header]");
    if (authored && isVisible(authored)) return authored;

    const pageTitle = cleanTitle(document.title);
    const headers = Array.from(document.querySelectorAll("header"))
      .filter((header) => !header.matches("[data-site-header], [data-generated-interactive-header], .site-shell-source-header"));
    const ranked = headers
      .map((header) => ({ header, score: scoreHeader(header, pageTitle) }))
      .sort((left, right) => right.score - left.score);
    if (ranked[0] && ranked[0].score >= 45) return ranked[0].header;

    return null;
  }

  function findFilterHeaderCandidate(filter) {
    if (!filter) return null;
    let candidate = filter.parentElement;

    for (let depth = 0; candidate && depth < 7; depth += 1, candidate = candidate.parentElement) {
      if (candidate === document.body || candidate.tagName === "MAIN" || candidate.id === "root") break;
      const rect = candidate.getBoundingClientRect();
      const headings = Array.from(candidate.querySelectorAll("h1, h2, h3"));
      const hasPageTitle = headings.some((heading) => {
        const text = cleanText(heading.textContent);
        return text.length >= 3 && text.length <= 120 && !/^(?:question|step|task)\s*\d+/i.test(text);
      });

      if (hasPageTitle && rect.width >= 300 && rect.height >= 40 && rect.height <= 220) {
        candidate.dataset.inferredInteractiveHeader = "";
        return candidate;
      }
    }

    return null;
  }

  function themeIsDark() {
    return document.documentElement.classList.contains("dark");
  }

  function themeIcon(dark) {
    return dark
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.42 1.42M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.42-1.42M17.66 6.34l1.41-1.41"></path></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>';
  }

  function updateThemeButton(button) {
    const dark = themeIsDark();
    button.innerHTML = themeIcon(dark);
    button.setAttribute("aria-label", dark ? "Use light theme" : "Use dark theme");
    button.title = dark ? "Use light theme" : "Use dark theme";
  }

  function createThemeButton() {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "interactive-shell-theme";
    button.dataset.siteThemeToggle = "";
    button.addEventListener("click", () => {
      const nextTheme = themeIsDark() ? "light" : "dark";
      document.documentElement.classList.toggle("dark", nextTheme === "dark");
      try {
        localStorage.setItem("uimode", nextTheme);
      } catch (_) {
        // Storage may be unavailable for local file previews; the theme still works.
      }
      updateThemeButton(button);
      window.dispatchEvent(new CustomEvent("site-theme-change", { detail: { theme: nextTheme } }));
    });
    updateThemeButton(button);
    return button;
  }

  function closeFilter(filter, panel) {
    panel.classList.remove("interactive-shell-filter-force-open");
    if (filter.hasAttribute("data-shell-hover-filter")) return;
    if (!panel.hidden && isVisible(panel)) filter.click();
  }

  function keepFilterInViewport(panel) {
    requestAnimationFrame(() => {
      panel.style.removeProperty("--interactive-shell-filter-shift-x");
      panel.style.removeProperty("--interactive-shell-filter-shift-y");
      if (!isVisible(panel)) return;
      const rect = panel.getBoundingClientRect();
      const gutter = 8;
      let shift = 0;
      if (rect.left < gutter) shift = gutter - rect.left;
      else if (rect.right > window.innerWidth - gutter) shift = window.innerWidth - gutter - rect.right;
      panel.style.setProperty("--interactive-shell-filter-shift-x", `${shift}px`);

      const interactiveHeader = panel.closest(".interactive-shell-header");
      const headerBottom = interactiveHeader?.getBoundingClientRect().bottom || 0;
      const shiftY = rect.top < headerBottom + gutter ? headerBottom + gutter - rect.top : 0;
      panel.style.setProperty("--interactive-shell-filter-shift-y", `${shiftY}px`);
    });
  }

  function standardizeFilterPanel(filter, panel) {
    if (!panel || !panel.querySelector('input[type="checkbox"], [role="menuitemcheckbox"]')) return;
    panel.classList.add("interactive-shell-filter-popover", "interactive-shell-standard-filter");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Filter topics");

    let close = panel.querySelector("[data-interactive-filter-close]");
    if (!close) {
      close = document.createElement("button");
      close.type = "button";
      close.className = "interactive-shell-filter-close";
      close.dataset.interactiveFilterClose = "";
      close.setAttribute("aria-label", "Close filter");
      close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
      close.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeFilter(filter, panel);
      });
      panel.insertAdjacentElement("afterbegin", close);
    }

    const buttons = Array.from(panel.querySelectorAll("button"));
    let apply = buttons.find((button) => /^apply(?:\s+(?:filter|filters))?/i.test(cleanText(button.textContent)));
    if (!apply) {
      apply = document.createElement("button");
      apply.type = "button";
      apply.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        closeFilter(filter, panel);
      });
      panel.appendChild(apply);
    }
    apply.textContent = "Apply Filter";
    apply.classList.add("interactive-shell-filter-apply");
    apply.dataset.interactiveFilterApply = "";

    Array.from(panel.querySelectorAll("h1, h2, h3, h4, legend, p, span, div")).forEach((heading) => {
      if (
        !heading.querySelector('input, button, [role="menuitemcheckbox"]') &&
        /^(?:(?:(?:select|filter)\s+)?(?:sub-?)?topics?|categories)$/i.test(cleanText(heading.textContent))
      ) {
        heading.classList.add("interactive-shell-filter-legacy-heading");
        const row = heading.parentElement;
        if (row && Array.from(row.children).every((child) => child === heading)) {
          row.classList.add("interactive-shell-filter-legacy-heading");
        }
      }
    });

    buttons.forEach((button) => {
      if (button === close || button === apply) return;
      const label = cleanText(button.textContent);
      if (/^(?:close|done)$/i.test(label) || (!label && button.querySelector("svg"))) {
        button.classList.add("interactive-shell-filter-legacy-action");
        const row = button.parentElement;
        if (
          row &&
          row.querySelector("h1, h2, h3, h4") &&
          Array.from(row.children).every((child) => child === button || /^H[1-4]$/.test(child.tagName))
        ) row.classList.add("interactive-shell-filter-legacy-action");
      }
    });
    keepFilterInViewport(panel);
  }

  function ensureThemeButton(actions) {
    let button = document.querySelector("[data-site-theme-toggle]");
    if (!button) button = createThemeButton();
    if (button.parentElement !== actions) actions.appendChild(button);
    updateThemeButton(button);
  }

  function createFilterProxy(original) {
    const proxy = document.createElement("button");
    proxy.type = "button";
    proxy.className = "interactive-shell-control";
    proxy.dataset.interactiveFilterProxy = "";
    const label = "Filter Topics";
    proxy.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 5h16l-6 7v5l-4 2v-7L4 5z"></path></svg>';
    const text = document.createElement("span");
    text.textContent = label;
    proxy.appendChild(text);
    proxy._interactiveShellSource = original;
    proxy.addEventListener("click", () => {
      const source = proxy._interactiveShellSource;
      if (source?.isConnected) source.click();
    });
    original.classList.add("interactive-shell-filter-source");
    original.setAttribute("aria-hidden", "true");
    original.setAttribute("tabindex", "-1");
    return proxy;
  }

  function inputLabel(input) {
    const explicit = input.id && document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
    return cleanText(
      explicit?.textContent ||
      input.closest("label")?.textContent ||
      input.getAttribute("aria-label") ||
      input.value,
    );
  }

  function findStandaloneTopicFilter() {
    const inputs = Array.from(document.querySelectorAll('input[type="checkbox"]'))
      .filter((input) => isVisible(input))
      .filter((input) => !input.closest("[data-interactive-shell-ready], .interactive-shell-filter-popover"));
    if (inputs.length < 2) return null;

    const headings = Array.from(document.querySelectorAll("h2, h3, h4, legend, p, div, span"))
      .filter(isVisible)
      .filter((element) => /^(?:sub-?topics?|active question topics)\s*:?(?:\s*\([^)]*\))?$/i.test(cleanText(element.textContent)));

    for (const heading of headings) {
      let group = heading.parentElement;
      for (let depth = 0; group && depth < 5; depth += 1, group = group.parentElement) {
        const groupInputs = Array.from(group.querySelectorAll('input[type="checkbox"]'))
          .filter((input) => !input.closest(".interactive-shell-filter-popover"));
        if (groupInputs.length < 2) continue;

        let inputContainer = groupInputs[0].parentElement;
        while (inputContainer && !groupInputs.every((input) => inputContainer.contains(input))) {
          inputContainer = inputContainer.parentElement;
        }
        if (!inputContainer) continue;
        return { group, heading, inputContainer, inputs: groupInputs };
      }
    }
    return null;
  }

  function hideStandaloneFilterSource(source) {
    source.heading.classList.add("interactive-shell-filter-source-group");
    source.inputContainer.classList.add("interactive-shell-filter-source-group");

    const parent = source.heading.parentElement;
    if (!parent) return;
    Array.from(parent.children).forEach((child) => {
      if (child === source.heading || child === source.inputContainer) return;
      const text = cleanText(child.textContent);
      const buttons = child.matches("button")
        ? [child]
        : Array.from(child.querySelectorAll("button"));
      if (
        /top-right filter panel|choose any combination/i.test(text) ||
        (buttons.length > 0 && buttons.every((button) => /select all|clear all|deselect all/i.test(cleanText(button.textContent))))
      ) child.classList.add("interactive-shell-filter-source-group");
    });

    if (source.group !== source.inputContainer && source.group.children.length <= 2) {
      source.group.classList.add("interactive-shell-filter-source-wrapper");
    }
  }

  function createStandaloneFilter(actions, source) {
    const existing = actions.querySelector("[data-generated-topic-filter]");
    if (existing) existing.remove();

    hideStandaloneFilterSource(source);
    const anchor = document.createElement("div");
    anchor.className = "interactive-shell-filter-anchor";
    anchor.dataset.generatedTopicFilter = "";

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "interactive-shell-control";
    trigger.dataset.interactiveFilter = "";
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 5h16l-6 7v5l-4 2v-7L4 5z"></path></svg><span>Filter Topics</span>';

    const panel = document.createElement("div");
    panel.className = "interactive-shell-filter-popover interactive-shell-standard-filter";
    panel.dataset.siteFilterMenu = "";
    panel.hidden = true;
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Filter topics");

    const close = document.createElement("button");
    close.type = "button";
    close.className = "interactive-shell-filter-close";
    close.dataset.interactiveFilterClose = "";
    close.setAttribute("aria-label", "Close filter");
    close.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>';
    panel.appendChild(close);

    const options = document.createElement("div");
    options.className = "interactive-shell-filter-options";
    const draftInputs = source.inputs.map((original, index) => {
      const label = document.createElement("label");
      label.className = "interactive-shell-filter-option";
      const draft = document.createElement("input");
      draft.type = "checkbox";
      draft.dataset.filterDraftIndex = String(index);
      const text = document.createElement("span");
      text.textContent = inputLabel(original) || `Topic ${index + 1}`;
      label.append(draft, text);
      options.appendChild(label);
      return draft;
    });
    panel.appendChild(options);

    const apply = document.createElement("button");
    apply.type = "button";
    apply.className = "interactive-shell-filter-apply";
    apply.dataset.interactiveFilterApply = "";
    apply.textContent = "Apply Filter";
    panel.appendChild(apply);

    const updateApplyState = () => {
      apply.disabled = !draftInputs.some((input) => input.checked);
    };
    const closePanel = () => {
      panel.hidden = true;
      trigger.setAttribute("aria-expanded", "false");
    };
    const openPanel = () => {
      source.inputs.forEach((input, index) => {
        draftInputs[index].checked = input.checked;
      });
      updateApplyState();
      panel.hidden = false;
      trigger.setAttribute("aria-expanded", "true");
      keepFilterInViewport(panel);
    };

    draftInputs.forEach((input) => input.addEventListener("change", updateApplyState));
    trigger.addEventListener("click", () => panel.hidden ? openPanel() : closePanel());
    close.addEventListener("click", closePanel);
    apply.addEventListener("click", () => {
      if (apply.disabled) return;
      source.inputs.forEach((original, index) => {
        if (original.checked !== draftInputs[index].checked) original.click();
      });
      closePanel();
    });

    anchor.append(trigger, panel);
    actions.insertAdjacentElement("afterbegin", anchor);
    return anchor;
  }

  function navigationSelectLabel(select) {
    const options = Array.from(select.options);
    if (options.length < 2) return null;

    const questionOptions = options.filter((option) => /^(?:question\s*|q)\d+\b/i.test(cleanText(option.textContent)));
    if (questionOptions.length >= Math.min(3, options.length)) return "Question";

    const identity = cleanText([
      select.id,
      select.name,
      select.getAttribute("aria-label"),
      select.id && document.querySelector(`label[for="${CSS.escape(select.id)}"]`)?.textContent,
    ].filter(Boolean).join(" "));
    if (/\btask\b/i.test(identity) || /taskselect/i.test(identity)) return "Task";
    if (/\b(?:problem|challenge)\b/i.test(identity) || /problemselect/i.test(identity)) return "Challenge";
    if (/\bsimulation\b/i.test(identity) || /sim-?select/i.test(identity)) return "Simulation";
    return null;
  }

  function clearNavigationSourceStyles() {
    document.querySelectorAll(".interactive-shell-question-source").forEach((select) => {
      select.classList.remove("interactive-shell-question-source");
    });
    document.querySelectorAll(".interactive-shell-question-source-host").forEach((host) => {
      host.classList.remove("interactive-shell-question-source-host");
    });
    document.querySelectorAll(".interactive-shell-question-source-label").forEach((label) => {
      label.classList.remove("interactive-shell-question-source-label");
    });
  }

  function findNavigationSelect() {
    return Array.from(document.querySelectorAll("select"))
      .filter((select) => !select.matches("[data-interactive-navigation-proxy-select]"))
      .filter((select) => !select.closest("[data-interactive-navigation-proxy], [data-interactive-question-proxy]"))
      .filter((select) => isVisible(select) && select.getClientRects().length > 0)
      .map((select) => ({ select, label: navigationSelectLabel(select) }))
      .find((candidate) => candidate.label) || null;
  }

  function setNativeSelectValue(select, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    if (setter) setter.call(select, value);
    else select.value = value;
    select.dispatchEvent(new Event("input", { bubbles: true }));
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function normalizeQuestionSelect(header, actions) {
    clearNavigationSourceStyles();
    const navigation = findNavigationSelect();
    const existingControl = actions.querySelector("[data-interactive-navigation-proxy], [data-interactive-question-proxy]");
    if (!navigation) {
      if (existingControl) existingControl.remove();
      return;
    }
    const { select: original, label: controlLabel } = navigation;
    if (header.contains(original)) {
      if (existingControl) existingControl.remove();
      original.classList.add("interactive-shell-question-select");
      original.setAttribute("aria-label", original.getAttribute("aria-label") || controlLabel);
      return;
    }

    let proxy = existingControl?.querySelector("select") || null;
    if (!proxy) {
      const wrapper = document.createElement("label");
      wrapper.className = "interactive-shell-question-control";
      wrapper.dataset.interactiveQuestionProxy = "";
      wrapper.dataset.interactiveNavigationProxy = "";
      const label = document.createElement("span");
      label.dataset.interactiveNavigationLabel = "";
      proxy = document.createElement("select");
      proxy.className = "interactive-shell-question-select";
      proxy.dataset.interactiveNavigationProxySelect = "";
      wrapper.append(label, proxy);
      actions.insertAdjacentElement("afterbegin", wrapper);
      proxy.addEventListener("change", () => {
        const source = proxy._interactiveShellSource;
        if (source?.isConnected) setNativeSelectValue(source, proxy.value);
      });
    }

    const wrapper = proxy.closest("[data-interactive-navigation-proxy], [data-interactive-question-proxy]");
    wrapper.dataset.interactiveNavigationProxy = "";
    const label = wrapper.querySelector("[data-interactive-navigation-label]") || wrapper.querySelector("span");
    if (label) {
      label.dataset.interactiveNavigationLabel = "";
      label.textContent = controlLabel;
    }
    proxy.dataset.interactiveNavigationProxySelect = "";
    proxy.setAttribute("aria-label", controlLabel);
    proxy._interactiveShellSource = original;

    const signature = Array.from(original.options).map((option) => `${option.value}:${cleanText(option.textContent)}`).join("|");
    if (proxy.dataset.optionsSignature !== signature) {
      proxy.replaceChildren(...Array.from(original.options).map((option) => {
        const clone = document.createElement("option");
        clone.value = option.value;
        clone.textContent = cleanText(option.textContent);
        return clone;
      }));
      proxy.dataset.optionsSignature = signature;
    }
    proxy.value = original.value;
    original.classList.add("interactive-shell-question-source");
    if (original.id) {
      const explicitLabel = document.querySelector(`label[for="${CSS.escape(original.id)}"]`);
      if (explicitLabel && !explicitLabel.contains(original)) {
        explicitLabel.classList.add("interactive-shell-question-source-label");
      }
    }
    const host = original.parentElement;
    if (host && Array.from(host.children).every((child) => child === original || child.tagName === "LABEL")) {
      host.classList.add("interactive-shell-question-source-host");
    }
  }

  function closestCommonAncestor(left, right, boundary) {
    let node = left;
    while (node && node !== boundary.parentElement) {
      if (node.contains(right)) return node;
      node = node.parentElement;
    }
    return boundary;
  }

  function normalizeTitleBlock(header, heading) {
    const existing = header.querySelector("[data-interactive-title-block]");
    if (existing) return;

    const headerHeadings = Array.from(header.querySelectorAll("h1, h2, h3"))
      .filter(isVisible)
      .filter((element) => !element.closest("[data-interactive-actions], button"));
    const primaryHeading = headerHeadings.find((element) => element.tagName === "H1") || heading;
    if (primaryHeading !== heading) heading.classList.remove("interactive-shell-title");
    primaryHeading.classList.add("interactive-shell-title");

    const subtitle = [
      ...headerHeadings.filter((element) => element !== primaryHeading),
      ...Array.from(header.querySelectorAll("p")),
    ]
      .filter(isVisible)
      .filter((element) => !element.closest("[data-interactive-actions], button"))
      .find((element) => {
        const text = cleanText(element.textContent);
        return text.length >= 3 && text.length <= 120;
      });

    if (subtitle && titleSimilarity(subtitle.textContent, primaryHeading.textContent) >= 0.8) {
      subtitle.classList.add("interactive-shell-title-source");
      return;
    }

    if (!subtitle) return;
    const common = closestCommonAncestor(primaryHeading, subtitle, header);
    if (common !== header && common.querySelectorAll("h1, h2, h3").length === 1) {
      common.classList.add("interactive-shell-title-block");
      common.dataset.interactiveTitleBlock = "";
      subtitle.classList.add("interactive-shell-subtitle");
      return;
    }

    const block = document.createElement("div");
    block.className = "interactive-shell-title-block";
    block.dataset.interactiveTitleBlock = "";
    const title = document.createElement("h1");
    title.className = "interactive-shell-title";
    title.textContent = cleanText(primaryHeading.textContent);
    const sub = document.createElement("p");
    sub.className = "interactive-shell-subtitle";
    sub.textContent = cleanText(subtitle.textContent);
    block.append(title, sub);
    header.insertAdjacentElement("afterbegin", block);
    primaryHeading.classList.add("interactive-shell-title-source");
    subtitle.classList.add("interactive-shell-title-source");
  }

  function normalizeStats() {
    const pattern = /^(?:🔥\s*)?(?:streak|score|attempted|correct|incorrect|right|wrong)\s*:?\s*\d+(?:\s*\/\s*\d+)?(?:\s*🔥)?$/i;
    Array.from(document.querySelectorAll("span, div, p"))
      .filter(isVisible)
      .filter((element) => {
        const text = cleanText(element.textContent);
        return text.length <= 45 && pattern.test(text);
      })
      .forEach((element) => element.classList.add("interactive-shell-stat"));
  }

  function colorParts(value) {
    const match = value.match(/rgba?\((\d+)[, ]+(\d+)[, ]+(\d+)(?:[, /]+([\d.]+))?/i);
    if (!match) return null;
    return { red: Number(match[1]), green: Number(match[2]), blue: Number(match[3]), alpha: match[4] === undefined ? 1 : Number(match[4]) };
  }

  function normalizeThemedSurfaces() {
    const dark = themeIsDark();
    document.querySelectorAll("body *").forEach((element) => {
      if (
        element.closest("[data-site-header], [data-interactive-shell-ready]") ||
        element.matches("button, svg, canvas, script, style, link, meta")
      ) return;
      const rect = element.getBoundingClientRect();
      const semantic = element.matches("pre, code, textarea, .cpu-box, .component, .ram-cell, [class*='terminal'], [class*='console'], [class*='calculator'], [class*='calc-'], [class*='code-pane'], [id*='editor'], [id*='console'], [id='sql-input']");
      if ((!semantic && rect.width * rect.height < 1600) || (semantic && rect.width * rect.height < 80)) return;
      const color = colorParts(getComputedStyle(element).backgroundColor);
      if (!color || color.alpha < 0.5) return;
      if (dark) {
        if (Math.min(color.red, color.green, color.blue) >= 235) {
          element.classList.add("interactive-shell-dark-surface");
        }
        return;
      }
      const lightModeThreshold = semantic ? 190 : 90;
      if (Math.max(color.red, color.green, color.blue) <= lightModeThreshold) {
        element.classList.add("interactive-shell-light-surface");
      }
    });
  }

  function findPostHeaderContent(header) {
    let current = header;
    while (current && current !== document.body) {
      let sibling = current.nextElementSibling;
      while (sibling && sibling.matches("script, style, link")) sibling = sibling.nextElementSibling;
      if (sibling && isVisible(sibling)) return sibling;
      current = current.parentElement;
    }
    return null;
  }

  function normalizeContentSpacing(header) {
    const content = findPostHeaderContent(header);
    if (!content) return;
    document.querySelectorAll(".interactive-shell-content-after-header").forEach((element) => {
      if (element !== content) {
        element.classList.remove(
          "interactive-shell-content-after-header",
          "interactive-shell-flow-flex-column",
          "interactive-shell-flow-grid",
          "interactive-shell-excess-top-space",
          "interactive-shell-card-content-gap",
        );
      }
    });
    content.classList.add("interactive-shell-content-after-header");
    const style = getComputedStyle(content);
    if (style.display.includes("flex") && style.flexDirection.startsWith("column")) {
      content.classList.add("interactive-shell-flow-flex-column");
    }
    if (style.display.includes("grid")) content.classList.add("interactive-shell-flow-grid");

    const parent = header.parentElement;
    const paintedCard = parent && parent !== document.body && (() => {
      const parentRect = parent.getBoundingClientRect();
      const background = colorParts(getComputedStyle(parent).backgroundColor);
      const firstVisibleChild = Array.from(parent.children)
        .find((child) => !child.matches("script, style, link") && isVisible(child));
      return firstVisibleChild === header
        && parentRect.width <= document.documentElement.clientWidth - 32
        && background
        && background.alpha >= 0.5;
    })();
    content.classList.toggle("interactive-shell-card-content-gap", Boolean(paintedCard));

    const headerBottom = header.getBoundingClientRect().bottom;
    let firstTop = Infinity;
    Array.from(content.querySelectorAll(":scope > *, main > *, section > *")).forEach((element) => {
      if (!isVisible(element) || element.matches("script, style")) return;
      const rect = element.getBoundingClientRect();
      if (rect.width > 220 && rect.height > 30 && rect.top >= headerBottom) firstTop = Math.min(firstTop, rect.top);
    });
    if (Number.isFinite(firstTop) && firstTop - headerBottom > 80) {
      content.classList.add("interactive-shell-excess-top-space");
    }
  }

  function hideDuplicateTitle(header, titleText) {
    const duplicate = Array.from(document.querySelectorAll("h1, h2, [role=heading]"))
      .filter((element) => !header.contains(element) && isVisible(element))
      .sort((left, right) => {
        const similarityDifference = titleSimilarity(right.textContent, titleText) - titleSimilarity(left.textContent, titleText);
        if (Math.abs(similarityDifference) > 0.05) return similarityDifference;
        return left.getBoundingClientRect().top - right.getBoundingClientRect().top;
      })[0];
    if (duplicate && titleSimilarity(duplicate.textContent, titleText) >= 0.6) {
      duplicate.classList.add("interactive-shell-duplicate-title");
    }
  }

  function createGeneratedHeader(filter) {
    const header = document.createElement("header");
    header.className = "interactive-shell-header";
    header.dataset.generatedInteractiveHeader = "";

    const titleBlock = document.createElement("div");
    titleBlock.className = "interactive-shell-title-block";
    titleBlock.dataset.interactiveTitleBlock = "";
    const title = document.createElement("h1");
    title.className = "interactive-shell-title";
    title.textContent = cleanTitle(document.title);
    titleBlock.appendChild(title);
    header.appendChild(titleBlock);

    const actions = document.createElement("div");
    actions.className = "interactive-shell-actions";
    actions.dataset.interactiveActions = "";
    if (filter) actions.appendChild(createFilterProxy(filter));
    header.appendChild(actions);

    const siteHeader = document.querySelector("[data-site-header]");
    const legacyHeader = document.querySelector(".site-shell-source-header");
    const anchor = siteHeader || legacyHeader;
    if (anchor) anchor.insertAdjacentElement("afterend", header);
    else document.body.insertAdjacentElement("afterbegin", header);

    hideDuplicateTitle(header, title.textContent);
    return header;
  }

  function findActionsHost(header, filter) {
    const authored = header.querySelector("[data-interactive-actions]");
    if (authored) return authored;
    if (filter && header.contains(filter)) {
      const anchor = filter.parentElement;
      const group = anchor?.parentElement;
      const hasCompanionControl = group && group !== header && Array.from(group.children).some((child) => {
        if (child === anchor) return false;
        return child.matches("select, button, .interactive-shell-stat")
          || Boolean(child.querySelector("select, button, .interactive-shell-stat"));
      });
      if (hasCompanionControl) return group;
      return anchor;
    }

    const actions = document.createElement("div");
    actions.dataset.interactiveActions = "";
    header.appendChild(actions);
    return actions;
  }

  function normalizeFilterPopover(filter) {
    if (!filter || !filter.parentElement) return;
    if (filter.closest("[data-generated-topic-filter]")) return;
    const anchor = filter.parentElement;
    anchor.classList.add("interactive-shell-filter-anchor");
    Array.from(anchor.children).forEach((child) => {
      if (child === filter || child.matches("[data-site-theme-toggle]")) return;
      if (child.querySelector('input[type="checkbox"], [role="menuitemcheckbox"]')) {
        standardizeFilterPanel(filter, child);
        if (getComputedStyle(child).display === "none" && !filter.hasAttribute("data-shell-hover-filter")) {
          filter.dataset.shellHoverFilter = "";
          filter.addEventListener("click", () => {
            child.classList.toggle("interactive-shell-filter-force-open");
            keepFilterInViewport(child);
          });
        }
      }
    });
  }

  function preventHeaderClipping(header) {
    let ancestor = header.parentElement;
    for (let depth = 0; ancestor && depth < 4; depth += 1, ancestor = ancestor.parentElement) {
      if (ancestor === document.body) break;
      const style = getComputedStyle(ancestor);
      if ([style.overflow, style.overflowX, style.overflowY].some((value) => value === "hidden" || value === "clip")) {
        ancestor.classList.add("interactive-shell-unclip");
      }
    }
  }

  function alignHeaderWithSiteHeader(header) {
    const siteHeader = document.querySelector("[data-site-header]");
    header.style.removeProperty("--interactive-shell-top-shift");
    if (!siteHeader) return;
    const siteBottom = siteHeader.getBoundingClientRect().bottom;
    let layout = header.parentElement;
    while (layout && layout !== document.body) {
      const rect = layout.getBoundingClientRect();
      if (rect.top <= siteBottom + 1 && rect.bottom > siteBottom) {
        const style = getComputedStyle(layout);
        layout.classList.add("interactive-shell-top-layout");
        if (style.display.includes("flex")) {
          if (style.flexDirection.startsWith("row")) layout.classList.add("interactive-shell-top-layout-row");
          else layout.classList.add("interactive-shell-top-layout-column");
        }
        break;
      }
      layout = layout.parentElement;
    }

    const gap = header.getBoundingClientRect().top - siteBottom;
    const shift = gap > 0.25 && gap <= 600 ? gap : 0;
    header.style.setProperty("--interactive-shell-top-shift", `${shift}px`);
  }

  function normalizeInteractiveHeader() {
    const generated = document.querySelector("[data-generated-interactive-header]");
    const globalFilter = document.querySelector(".interactive-shell-filter-source") || findFilterControl();
    const existing = findInteractiveHeader() || findFilterHeaderCandidate(globalFilter);
    if (generated && existing && generated !== existing) {
      generated.remove();
      document.querySelectorAll(".interactive-shell-filter-source").forEach((control) => {
        control.classList.remove("interactive-shell-filter-source");
        control.removeAttribute("aria-hidden");
        control.removeAttribute("tabindex");
      });
      existing.querySelectorAll(".interactive-shell-duplicate-title").forEach((title) => {
        title.classList.remove("interactive-shell-duplicate-title");
      });
    }

    let header = existing || generated;

    if (!header) header = createGeneratedHeader(globalFilter);
    header.classList.add("interactive-shell-header");
    if (header.tagName !== "HEADER") header.setAttribute("role", "banner");
    header.dataset.interactiveShellReady = "";

    const heading = findTitleHeading(header) || Array.from(header.querySelectorAll("h3, p, span"))
      .find((element) => {
        const text = cleanText(element.textContent);
        return isVisible(element) && !element.closest("button, [data-interactive-actions]") && text.length >= 3 && text.length <= 100;
      });
    if (heading) {
      heading.classList.add("interactive-shell-title");
      normalizeTitleBlock(header, heading);
    }
    if (header.hasAttribute("data-generated-interactive-header")) {
      hideDuplicateTitle(header, heading ? heading.textContent : cleanTitle(document.title));
    }

    normalizeStats();
    const localFilter = findFilterControl(header);
    const actions = findActionsHost(header, localFilter);
    actions.classList.add("interactive-shell-actions");
    if (localFilter) {
      if (!localFilter.hasAttribute("data-interactive-filter-proxy")) {
        header.querySelectorAll("[data-interactive-filter-proxy]").forEach((proxy) => proxy.remove());
        localFilter.classList.remove("interactive-shell-filter-source");
        localFilter.removeAttribute("aria-hidden");
        localFilter.removeAttribute("tabindex");
      }
      standardizeFilterTrigger(localFilter);
      normalizeFilterPopover(localFilter);
    }
    else if (globalFilter && !header.querySelector("[data-interactive-filter-proxy]")) {
      actions.insertAdjacentElement("afterbegin", createFilterProxy(globalFilter));
    }
    else if (globalFilter) {
      const proxy = header.querySelector("[data-interactive-filter-proxy]");
      if (proxy) {
        proxy._interactiveShellSource = globalFilter;
        globalFilter.classList.add("interactive-shell-filter-source");
        globalFilter.setAttribute("aria-hidden", "true");
        globalFilter.setAttribute("tabindex", "-1");
      }
    }
    const standaloneFilter = findStandaloneTopicFilter();
    if (standaloneFilter) createStandaloneFilter(actions, standaloneFilter);
    normalizeQuestionSelect(header, actions);
    ensureThemeButton(actions);
    preventHeaderClipping(header);
    alignHeaderWithSiteHeader(header);
    normalizeContentSpacing(header);
    normalizeThemedSurfaces();
  }

  function normalize() {
    if (normalizing || !document.body) return;
    normalizing = true;
    try {
      updatePageWidth();
      hideLegacySiteHeaders();
      const pageKind = document.body.dataset.sitePage;
      if (pageKind !== "site" && !siteOnlyPages.has(pageName)) normalizeInteractiveHeader();
    } finally {
      normalizing = false;
    }
  }

  function scheduleNormalize() {
    if (normalizing || normalizeScheduled) return;
    normalizeScheduled = true;
    requestAnimationFrame(() => {
      normalizeScheduled = false;
      normalize();
    });
  }

  // This runs while the parser is still in the head. A small set of older
  // vanilla demos query these three former header IDs during startup; supplying
  // them here lets the copied navigation markup be removed without changing the
  // lesson logic in those pages.
  ensureLegacyThemeCompatibility();
  ensureStylesheet();
  updatePageWidth();
  window.addEventListener("resize", updatePageWidth, { passive: true });
  window.addEventListener("resize", () => {
    document.querySelectorAll(".interactive-shell-filter-popover").forEach(keepFilterInViewport);
  }, { passive: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", normalize, { once: true });
  else normalize();

  // React pages can render their authored toolbar in the same frame as the
  // first normalization. Delayed passes ensure it replaces a temporary
  // generated header even when that initial mutation is coalesced.
  [50, 250, 1000].forEach((delay) => window.setTimeout(normalize, delay));

  observer = new MutationObserver(scheduleNormalize);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  // React controls are frequently unmounted and recreated long after the first
  // render (for example after Apply Filter or Next Question). Keep normalizing
  // for the lifetime of the page and schedule a pass after user-driven state
  // changes even when a framework updates only properties or CSS classes.
  ["click", "change"].forEach((eventName) => {
    document.addEventListener(eventName, () => window.setTimeout(scheduleNormalize, 0), true);
  });

  const themeObserver = new MutationObserver(() => {
    const button = document.querySelector("[data-site-theme-toggle]");
    if (button) updateThemeButton(button);
    scheduleNormalize();
  });
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
})();
