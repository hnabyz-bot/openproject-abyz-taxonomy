(function () {
  "use strict";

  var state = {
    tree: null,
    loading: null,
    allowNativeWpCreate: false,
    drag: null
  };

  function csrfToken() {
    var tag = document.querySelector('meta[name="csrf-token"]');
    return tag ? tag.getAttribute("content") : "";
  }

  function fetchJson(url, options) {
    var headers = Object.assign({
      "Accept": "application/json",
      "Content-Type": "application/json",
      "X-CSRF-Token": csrfToken()
    }, options && options.headers ? options.headers : {});

    return fetch(url, Object.assign({
      credentials: "same-origin",
      headers: headers
    }, options || {})).then(function (response) {
      return response.json().catch(function () {
        return {};
      }).then(function (body) {
        if (!response.ok) {
          throw new Error(body.message || "Abyz taxonomy request failed");
        }
        return body;
      });
    });
  }

  function loadTree() {
    if (state.loading) {
      return state.loading;
    }

    state.loading = fetchJson("/abyz_taxonomy/ui/tree")
      .then(function (tree) {
        state.tree = tree;
        return tree;
      })
      .finally(function () {
        state.loading = null;
      });

    return state.loading;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function slug(value) {
    var cleaned = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

    return cleaned || "taxonomy-" + new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  }

  function currentProjectIdentifier() {
    var match = window.location.pathname.match(/\/projects\/([^/]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function tableColspan(table, fallback) {
    return Math.max(table ? table.querySelectorAll("thead th").length : 0, fallback || 1);
  }

  function projectTitleEntries() {
    return state.tree && state.tree.projectTitles ? state.tree.projectTitles : [];
  }

  function wpSectionEntries() {
    return state.tree && state.tree.wpSections ? state.tree.wpSections : [];
  }

  function taxonomyTypeLabel(node) {
    var taxonomyType = node && node.rules && node.rules.taxonomyType;
    if (taxonomyType === "portfolio") {
      return "포트폴리오";
    }
    if (taxonomyType === "program") {
      return "프로그램";
    }
    if (node && node.nodeKind === "wp_section") {
      return "섹션";
    }
    return "타이틀";
  }

  function taxonomyTooltipText(node) {
    if (!node) {
      return "";
    }
    var kind = node.nodeKind || node.node_kind;
    var taxonomyType = node.rules && node.rules.taxonomyType;

    if (taxonomyType === "portfolio") {
      return "포트폴리오: 최상위 분류 단위입니다. 여러 프로그램 또는 타이틀을 묶는 전략적 그룹입니다. 실제 OpenProject 프로젝트가 아닌 표시 전용 행입니다.";
    }
    if (taxonomyType === "program") {
      return "프로그램: 관련 타이틀 또는 프로젝트 그룹의 중간 분류입니다. 포트폴리오 하위에 위치하며 실제 OpenProject 프로젝트가 아닌 표시 전용 행입니다.";
    }
    if (kind === "wp_section") {
      return "섹션: 프로젝트 내 Work Package 분류 단위입니다. 섹션 아래에 WP를 배치하여 업무를 구분합니다. 실제 OpenProject Work Package가 아닌 표시 전용 행입니다.";
    }
    return "타이틀: 프로젝트 목록을 구분하는 분류 행입니다. 타이틀 아래에 실제 프로젝트를 배치할 수 있습니다. 실제 OpenProject 프로젝트가 아닌 표시 전용 행입니다.";
  }

  function infoIcon(node) {
    return '<span class="abyz-info-icon" data-tooltip="' + escapeHtml(taxonomyTooltipText(node)) + '" aria-label="설명">ⓘ</span>';
  }

  function taxonomyNodeByCode(code) {
    var match = null;
    projectTitleEntries().some(function (entry) {
      if (entry.title.code === code) {
        match = entry.title;
        return true;
      }
      return false;
    });
    if (match) {
      return match;
    }

    wpSectionEntries().some(function (entry) {
      if (entry.section.code === code) {
        match = entry.section;
        return true;
      }
      return false;
    });

    return match;
  }

  function closeCreateMenus() {
    var menu = document.getElementById("abyz-taxonomy-wp-create-menu");
    if (menu) {
      menu.remove();
    }

    closeTaxonomyContextMenus();

    Array.prototype.forEach.call(document.querySelectorAll("[popover]"), function (popover) {
      if (typeof popover.hidePopover === "function") {
        try {
          popover.hidePopover();
        } catch (error) {
          // The popover may already be closed.
        }
      }
    });
  }

  function attributeString(attributes) {
    return Object.keys(attributes || {}).map(function (key) {
      return key + '="' + escapeHtml(attributes[key]) + '"';
    }).join(" ");
  }

  function actionListMenuItem(label, action, attributes) {
    return [
      '<li data-abyz-taxonomy-menu-item role="none" data-view-component="true" class="ActionListItem">',
      '<button type="button" tabindex="-1" role="menuitem" data-view-component="true" class="ActionListContent ActionListContent--visual16 abyz-taxonomy-menu-action" data-abyz-action="' + escapeHtml(action) + '" ' + attributeString(attributes) + '>',
      '<span class="ActionListItem-visual ActionListItem-visual--leading"><span class="abyz-taxonomy-menu-plus">+</span></span>',
      '<span data-view-component="true" class="ActionListItem-label">' + escapeHtml(label) + '</span>',
      '</button>',
      '</li>'
    ].join("");
  }

  function projectCreateMenuList() {
    var page = document.querySelector(".project-list-page");
    if (!page) {
      return null;
    }

    var trigger = page.querySelector('button[aria-label="추가"][aria-controls], button[aria-label="추가"][popovertarget]');
    if (!trigger) {
      return null;
    }

    var listId = trigger.getAttribute("aria-controls");
    var list = listId ? document.getElementById(listId) : null;
    if (list && list.getAttribute("role") === "menu") {
      return list;
    }

    var overlayId = trigger.getAttribute("popovertarget");
    var overlay = overlayId ? document.getElementById(overlayId) : null;
    return overlay ? overlay.querySelector('ul[role="menu"]') : null;
  }

  function enhanceProjectCreateMenu() {
    var list = projectCreateMenuList();
    if (!list || list.dataset.abyzTaxonomyEnhanced === "true") {
      return;
    }

    list.insertAdjacentHTML("afterbegin", [
      actionListMenuItem("포트폴리오 추가", "project-title", { "data-taxonomy-type": "portfolio", "data-abyz-menu-scope": "project-list" }),
      actionListMenuItem("프로그램 추가", "project-title", { "data-taxonomy-type": "program", "data-abyz-menu-scope": "project-list" }),
      actionListMenuItem("타이틀 추가", "project-title", { "data-taxonomy-type": "title", "data-abyz-menu-scope": "project-list" }),
      actionListMenuItem("타이틀 아래 프로젝트 추가", "project-under-title", { "data-abyz-menu-scope": "project-list" }),
      '<li data-abyz-taxonomy-menu-item role="separator" class="ActionList-sectionDivider"></li>'
    ].join(""));
    list.dataset.abyzTaxonomyEnhanced = "true";
  }

  function enhanceGlobalQuickAddMenu() {
    var list = document.getElementById("op-app-header--quick-add-menu-list");
    if (!list) {
      return;
    }

    var projectIdentifier = currentProjectIdentifier() || "";
    if (list.dataset.abyzTaxonomyEnhancedFor === projectIdentifier) {
      return;
    }

    Array.prototype.forEach.call(list.querySelectorAll("[data-abyz-taxonomy-menu-item]"), function (item) {
      item.remove();
    });

    var items = [
      actionListMenuItem("포트폴리오 추가", "project-title", { "data-taxonomy-type": "portfolio", "data-abyz-menu-scope": "global" }),
      actionListMenuItem("프로그램 추가", "project-title", { "data-taxonomy-type": "program", "data-abyz-menu-scope": "global" }),
      actionListMenuItem("타이틀 추가", "project-title", { "data-taxonomy-type": "title", "data-abyz-menu-scope": "global" }),
      actionListMenuItem("타이틀 아래 프로젝트 추가", "project-under-title", { "data-abyz-menu-scope": "global" })
    ];

    if (projectIdentifier) {
      items.push(actionListMenuItem("섹션 추가", "wp-section", { "data-abyz-menu-scope": "global" }));
      items.push(actionListMenuItem("섹션 아래 WP", "wp-under-section", { "data-abyz-menu-scope": "global" }));
    }

    items.push('<li data-abyz-taxonomy-menu-item role="separator" class="ActionList-sectionDivider"></li>');
    list.insertAdjacentHTML("afterbegin", items.join(""));
    list.dataset.abyzTaxonomyEnhancedFor = projectIdentifier;
  }

  function openWpCreateMenu(button) {
    closeCreateMenus();

    var rect = button.getBoundingClientRect();
    var menu = document.createElement("div");
    menu.id = "abyz-taxonomy-wp-create-menu";
    menu.className = "abyz-taxonomy-popover-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("data-test-selector", "abyz-taxonomy-wp-create-menu");
    menu.style.left = Math.max(8, rect.left + window.scrollX) + "px";
    menu.style.top = (rect.bottom + window.scrollY + 6) + "px";
    menu.innerHTML = [
      '<button type="button" role="menuitem" data-abyz-action="native-work-package">작업 패키지 추가</button>',
      '<button type="button" role="menuitem" data-abyz-action="wp-section">섹션 추가</button>',
      '<button type="button" role="menuitem" data-abyz-action="wp-under-section">섹션 아래 WP</button>'
    ].join("");
    document.body.appendChild(menu);
  }

  function insertProjectActions() {
    enhanceProjectCreateMenu();
    enhanceGlobalQuickAddMenu();
  }

  function insertWorkPackageActions() {
    return;
  }

  function projectIdentifierFromHref(href) {
    var match = String(href || "").match(/\/projects\/([^/?#]+)\/?(?:[?#].*)?$/);
    return match && match[1] !== "new" ? decodeURIComponent(match[1]) : null;
  }

  function nodeSettingsPath(code) {
    return "/abyz_taxonomy/ui/nodes/" + encodeURIComponent(code) + "/settings/general";
  }

  function closeTaxonomyContextMenus() {
    Array.prototype.forEach.call(document.querySelectorAll(".abyz-taxonomy-node-menu"), function (menu) {
      menu.remove();
    });
  }

  function taxonomyContextMenuButton(label, action, code) {
    return [
      '<li role="none">',
      '<button type="button" role="menuitem" class="ActionListContent ActionListContent--visual16 abyz-taxonomy-menu-action" data-abyz-action="' + escapeHtml(action) + '" data-code="' + escapeHtml(code) + '">',
      '<span class="ActionListItem-label">' + escapeHtml(label) + '</span>',
      '</button>',
      '</li>'
    ].join("");
  }

  function taxonomyContextMenuLink(label, href) {
    return [
      '<li role="none">',
      '<a role="menuitem" class="ActionListContent ActionListContent--visual16" href="' + escapeHtml(href) + '">',
      '<span class="ActionListItem-label">' + escapeHtml(label) + '</span>',
      '</a>',
      '</li>'
    ].join("");
  }

  function taxonomyRowMenuButton(code, context) {
    return [
      '<button type="button" class="Button Button--iconOnly Button--invisible Button--small abyz-taxonomy-row-menu-button" aria-label="추가 작업" title="추가 작업" data-abyz-action="open-node-menu" data-code="' + escapeHtml(code) + '" data-context="' + escapeHtml(context) + '">',
      '<span aria-hidden="true">⋯</span>',
      '</button>'
    ].join("");
  }

  function openTaxonomyContextMenu(trigger) {
    var code = trigger.getAttribute("data-code");
    var context = trigger.getAttribute("data-context");
    var node = taxonomyNodeByCode(code);
    if (!node) {
      return;
    }

    closeTaxonomyContextMenus();

    var rect = trigger.getBoundingClientRect();
    var menu = document.createElement("ul");
    menu.className = "dropdown-menu abyz-taxonomy-node-menu";
    menu.setAttribute("role", "menu");
    menu.setAttribute("data-test-selector", "abyz-taxonomy-node-menu");
    menu.style.left = Math.max(8, rect.right + window.scrollX - 240) + "px";
    menu.style.top = (rect.bottom + window.scrollY + 6) + "px";

    if (context === "project-title") {
      menu.innerHTML = [
        taxonomyContextMenuButton("새 하위 프로젝트", "project-under-title", code),
        taxonomyContextMenuLink(taxonomyTypeLabel(node) + " 설정", nodeSettingsPath(code)),
        '<li role="separator" class="ActionList-sectionDivider"></li>',
        taxonomyContextMenuButton("삭제", "delete-node", code)
      ].join("");
    } else {
      menu.innerHTML = [
        taxonomyContextMenuLink("자세히 보기", nodeSettingsPath(code)),
        taxonomyContextMenuButton("새 작업 패키지 만들기", "wp-under-section", code),
        '<li role="separator" class="ActionList-sectionDivider"></li>',
        taxonomyContextMenuButton("삭제", "delete-node", code)
      ].join("");
    }

    document.body.appendChild(menu);
  }

  function projectIdentifierFromRow(row) {
    var links = row.querySelectorAll('a[href*="/projects/"]');
    for (var i = 0; i < links.length; i += 1) {
      var identifier = projectIdentifierFromHref(links[i].getAttribute("href"));
      if (identifier) {
        return identifier;
      }
    }
    return null;
  }

  function projectRowMap(tbody) {
    var map = {};
    Array.prototype.forEach.call(tbody.querySelectorAll("tr"), function (row) {
      if (row.classList.contains("abyz-taxonomy-project-title-row")) {
        return;
      }

      var identifier = projectIdentifierFromRow(row);
      if (identifier) {
        map[identifier] = row;
      }
    });
    return map;
  }

  function projectRenderSignature(tbody) {
    var identifiers = [];
    Array.prototype.forEach.call(tbody.querySelectorAll("tr"), function (row) {
      if (row.classList.contains("abyz-taxonomy-project-title-row")) {
        return;
      }

      var identifier = projectIdentifierFromRow(row);
      if (identifier) {
        identifiers.push(identifier);
      }
    });

    var titles = projectTitleEntries().map(function (entry) {
      return entry.title.code + ":" + entry.title.name + ":" + taxonomyTypeLabel(entry.title) + ":" + (entry.projects || []).map(function (project) {
        return project.identifier;
      }).join(",");
    });

    return identifiers.join("|") + "::" + titles.join("|");
  }

  function buildProjectTitleRow(entry, columnCount) {
    var title = entry.title;
    var count = entry.projects ? entry.projects.length : 0;
    var row = document.createElement("tr");
    row.className = "abyz-taxonomy-project-title-row";
    row.setAttribute("data-abyz-taxonomy-code", title.code);
    var ttype = (title.rules && title.rules.taxonomyType) || "title";
    row.setAttribute("data-abyz-taxonomy-type", ttype);
    row.setAttribute("data-test-selector", "abyz-taxonomy-project-title-row");
    row.innerHTML = [
      '<td colspan="' + columnCount + '" class="abyz-taxonomy-title-cell">',
      '<div class="abyz-taxonomy-row-inner">',
      '<div class="abyz-taxonomy-row-label">',
      '<span>' + escapeHtml(title.name) + infoIcon(title) + '</span>',
      '<span class="abyz-taxonomy-row-meta">' + escapeHtml(taxonomyTypeLabel(title)) + ', 실제 Project 아님, ' + count + '개 Project</span>',
      '</div>',
      '<div class="abyz-taxonomy-row-actions">',
      taxonomyRowMenuButton(title.code, "project-title"),
      '</div>',
      '</div>',
      '</td>'
    ].join("");
    return row;
  }

  function decorateProjectChildRow(row) {
    var hierarchyCell = row.querySelector("td.hierarchy");
    var nameCell = row.querySelector("td.name.project--hierarchy");
    var originalLink = nameCell && nameCell.querySelector('a[href*="/projects/"]');
    if (!hierarchyCell || !originalLink) {
      return;
    }

    originalLink.classList.add("abyz-taxonomy-project-child-original-link");
    if (hierarchyCell.querySelector(".abyz-taxonomy-project-child-display-link")) {
      return;
    }

    var displayLink = originalLink.cloneNode(true);
    displayLink.classList.add("abyz-taxonomy-project-child-display-link");
    displayLink.classList.remove("abyz-taxonomy-project-child-original-link");
    hierarchyCell.appendChild(displayLink);
  }

  function resetProjectChildRow(row) {
    Array.prototype.forEach.call(row.querySelectorAll(".abyz-taxonomy-project-child-display-link"), function (link) {
      link.remove();
    });
    Array.prototype.forEach.call(row.querySelectorAll(".abyz-taxonomy-project-child-original-link"), function (link) {
      link.classList.remove("abyz-taxonomy-project-child-original-link");
    });
  }

  function projectSelectList() {
    return document.querySelector('#op-header-project-select-listbox[data-test-selector="op-header-project-select--list"], [data-test-selector="op-header-project-select--list"]');
  }

  function projectSelectItemMap(list) {
    var map = {};
    Array.prototype.forEach.call(list.querySelectorAll('li[data-test-selector="op-header-project-select--item"]'), function (item) {
      if (item.classList.contains("abyz-taxonomy-project-select-title")) {
        return;
      }

      var link = item.querySelector('a[href*="/projects/"]');
      var identifier = link && projectIdentifierFromHref(link.getAttribute("href"));
      if (identifier) {
        map[identifier] = item;
      }
    });
    return map;
  }

  function projectSelectSignature(list) {
    var identifiers = [];
    Array.prototype.forEach.call(list.querySelectorAll('li[data-test-selector="op-header-project-select--item"]'), function (item) {
      if (item.classList.contains("abyz-taxonomy-project-select-title")) {
        return;
      }

      var link = item.querySelector('a[href*="/projects/"]');
      var identifier = link && projectIdentifierFromHref(link.getAttribute("href"));
      if (identifier) {
        identifiers.push(identifier);
      }
    });

    var titles = projectTitleEntries().map(function (entry) {
      return [entry.title.code, entry.title.name, taxonomyTypeLabel(entry.title), (entry.projects || []).map(function (project) {
        return project.identifier;
      }).join(",")].join(":");
    });

    return identifiers.join("|") + "::" + titles.join("|");
  }

  function buildProjectSelectTitleItem(entry) {
    var title = entry.title;
    var item = document.createElement("li");
    item.className = "spot-list--item abyz-taxonomy-project-select-title";
    item.setAttribute("role", "none");
    item.setAttribute("data-test-selector", "op-header-project-select--item");
    item.setAttribute("data-abyz-taxonomy-code", title.code);
    item.innerHTML = [
      '<div class="spot-list--item-action abyz-taxonomy-project-select-title-action">',
      '<span class="abyz-taxonomy-project-select-title-label">' + escapeHtml(title.name) + '</span>',
      '<span class="abyz-taxonomy-project-select-title-meta">' + escapeHtml(taxonomyTypeLabel(title)) + ', 실제 Project 아님</span>',
      '</div>'
    ].join("");
    return item;
  }

  function renderProjectSelectTaxonomyRows() {
    var list = projectSelectList();
    if (!list || !state.tree) {
      return;
    }

    var signature = projectSelectSignature(list);
    if (list.dataset.abyzTaxonomySignature === signature) {
      return;
    }

    Array.prototype.forEach.call(list.querySelectorAll(".abyz-taxonomy-project-select-title"), function (item) {
      item.remove();
    });

    var realItems = Array.prototype.slice.call(list.querySelectorAll('li[data-test-selector="op-header-project-select--item"]'));
    var itemsByIdentifier = projectSelectItemMap(list);
    var assignedItems = [];
    var orderedItems = [];

    realItems.forEach(function (item) {
      item.classList.remove("abyz-taxonomy-project-select-child");
      item.removeAttribute("data-abyz-display-parent");
    });

    projectTitleEntries().forEach(function (entry) {
      var titleItem = buildProjectSelectTitleItem(entry);
      injectNodeReorderHandle(titleItem, entry.title.code, "title", ".abyz-taxonomy-project-select-title-action");
      addNodeReorderDropHandlers(titleItem, entry.title.code, "title", ".abyz-taxonomy-project-title-row, .abyz-taxonomy-project-select-title");
      // @MX:NOTE: sidebar dropdown title li also accepts project drops (move_project) — fixes #4
      addProjectSelectTitleDropHandlers(titleItem, entry.title.code);
      orderedItems.push(titleItem);
      (entry.projects || []).forEach(function (project) {
        var item = itemsByIdentifier[project.identifier];
        if (item) {
          item.classList.add("abyz-taxonomy-project-select-child");
          item.setAttribute("data-abyz-display-parent", entry.title.code);
          // @MX:NOTE: inject drag handle on sidebar project li so it can be moved between titles (#4)
          injectProjectSelectDragHandle(item, project.identifier, entry.title.code);
          assignedItems.push(item);
          orderedItems.push(item);
        }
      });
    });

    realItems.forEach(function (item) {
      if (assignedItems.indexOf(item) === -1) {
        orderedItems.push(item);
      }
    });

    orderedItems.forEach(function (item) {
      list.appendChild(item);
    });

    list.dataset.abyzTaxonomySignature = signature;
  }

  function renderProjectTitleRows() {
    var table = document.getElementById("project-table");
    var tbody = table && table.querySelector("tbody");
    if (!tbody || !state.tree) {
      return;
    }

    var signature = projectRenderSignature(tbody);
    if (table.dataset.abyzTaxonomySignature === signature) {
      return;
    }

    Array.prototype.forEach.call(tbody.querySelectorAll(".abyz-taxonomy-project-title-row"), function (row) {
      row.remove();
    });

    var realRows = Array.prototype.slice.call(tbody.querySelectorAll("tr"));
    var rowsByIdentifier = projectRowMap(tbody);
    var colspan = tableColspan(table, 4);
    var orderedRows = [];
    var assignedRows = [];

    projectTitleEntries().forEach(function (entry) {
      var row = buildProjectTitleRow(entry, colspan);
      addProjectTitleDropHandlers(row, entry.title.code);
      addNodeReorderDropHandlers(row, entry.title.code, "title", ".abyz-taxonomy-project-title-row, .abyz-taxonomy-project-select-title");
      injectNodeReorderHandle(row, entry.title.code, "title", ".abyz-taxonomy-row-inner");
      addTitleHierarchyDropHandlers(row, entry.title.code);
      var projectRows = (entry.projects || []).map(function (project) {
        return rowsByIdentifier[project.identifier];
      }).filter(Boolean);

      orderedRows.push(row);
      // @MX:NOTE: 부모 타이틀 타입별 프로젝트 들여쓰기 — portfolio=2rem, program=4rem, title=6rem (#9)
      var tType = (entry.title.rules && entry.title.rules.taxonomyType) || "title";
      var hierarchyIndent = tType === "portfolio" ? "2rem" : tType === "program" ? "4rem" : "6rem";
      projectRows.forEach(function (projectRow) {
        projectRow.classList.add("abyz-taxonomy-project-child-row");
        projectRow.setAttribute("data-abyz-display-parent", entry.title.code);
        projectRow.setAttribute("data-abyz-parent-type", tType);
        decorateProjectChildRow(projectRow);
        var hierTd = projectRow.querySelector("td.hierarchy");
        if (hierTd) { hierTd.style.paddingLeft = hierarchyIndent; }
        injectProjectDragHandle(projectRow, entry.title.code);
        assignedRows.push(projectRow);
        orderedRows.push(projectRow);
      });
    });

    realRows.forEach(function (row) {
      if (assignedRows.indexOf(row) === -1) {
        row.classList.remove("abyz-taxonomy-project-child-row");
        row.removeAttribute("data-abyz-display-parent");
        resetProjectChildRow(row);
        injectProjectDragHandle(row, null);
        orderedRows.push(row);
      }
    });

    orderedRows.forEach(function (row) {
      tbody.appendChild(row);
    });

    table.dataset.abyzTaxonomySignature = signature;
  }

  // @MX:NOTE: 타이틀 계층 이동 drop — 다른 타이틀 위에 놓으면 부모(parent_id) 변경 (#9)
  function addTitleHierarchyDropHandlers(row, titleCode) {
    var guard = "abyzTitleHierarchyDrop";
    if (row.dataset[guard] === "true") { return; }
    row.dataset[guard] = "true";

    row.addEventListener("dragover", function (e) {
      if (state.drag && state.drag.code !== titleCode && (state.drag.type === "title-hierarchy" || (state.drag.hierarchyMove && state.drag.type === "title"))) {
        e.preventDefault();
        row.classList.add("abyz-title-drop-target");
      }
    });
    row.addEventListener("dragleave", function (e) {
      if (!row.contains(e.relatedTarget)) { row.classList.remove("abyz-title-drop-target"); }
    });
    row.addEventListener("drop", function (e) {
      if (state.drag && state.drag.code !== titleCode && (state.drag.type === "title-hierarchy" || (state.drag.hierarchyMove && state.drag.type === "title"))) {
        e.preventDefault();
        var childCode = state.drag.code;
        row.classList.remove("abyz-title-drop-target");
        state.drag = null;
        fetchJson("/abyz_taxonomy/ui/assignments/move_title", {
          method: "PATCH",
          body: JSON.stringify({ titleCode: childCode, toParentCode: titleCode })
        }).then(function () { return refreshTaxonomyViews("taxonomyNode"); })
          .catch(function (err) { window.alert(err.message); });
      }
    });
  }

  function workPackageRowMap(tbody) {
    var map = {};
    Array.prototype.forEach.call(tbody.querySelectorAll("tr"), function (row) {
      if (row.classList.contains("abyz-taxonomy-wp-section-row")) {
        return;
      }

      // @MX:NOTE: getWpIdFromRow 재사용(data-work-package-id 우선) — 운영 slug permalink 대응 (#14)
      var id = getWpIdFromRow(row);
      if (id) {
        map[id] = row;
      }
    });
    return map;
  }

  function workPackageRenderSignature(tbody, projectIdentifier) {
    // Include DOM row order (both section and WP rows) so OP resets are detected
    var rowSigs = [];
    Array.prototype.forEach.call(tbody.querySelectorAll("tr"), function (row) {
      var code = row.getAttribute("data-abyz-taxonomy-code");
      if (code) {
        rowSigs.push("s:" + code);
        return;
      }
      // @MX:NOTE: getWpIdFromRow 재사용(data-work-package-id 우선) — 운영 slug permalink 대응 (#14)
      var sigWpId = getWpIdFromRow(row);
      if (sigWpId) {
        rowSigs.push("w:" + sigWpId);
      }
    });

    var sections = wpSectionEntries()
      .filter(function (entry) {
        return entry.project && entry.project.identifier === projectIdentifier;
      })
      .map(function (entry) {
        return entry.section.code + ":" + (entry.workPackages || []).map(function (wp) {
          return wp.id;
        }).join(",");
      });

    return rowSigs.join("|") + "::" + sections.join("|");
  }

  function buildWpSectionRow(entry, colspan) {
    var section = entry.section;
    var count = entry.workPackages ? entry.workPackages.length : 0;
    var row = document.createElement("tr");
    row.className = "wp-table--group-header abyz-taxonomy-wp-section-row";
    row.setAttribute("data-abyz-taxonomy-code", section.code);
    row.setAttribute("data-test-selector", "abyz-taxonomy-wp-section-row");
    row.innerHTML = [
      '<td colspan="' + colspan + '" class="abyz-taxonomy-section-cell -no-highlighting">',
      '<div class="abyz-taxonomy-row-inner">',
      '<div class="abyz-taxonomy-row-label">',
      '<span>' + escapeHtml(section.name) + infoIcon(section) + '</span>',
      '<span class="abyz-taxonomy-row-meta">' + escapeHtml(taxonomyTypeLabel(section)) + ', 실제 WP 아님, ' + count + '개 WP</span>',
      '</div>',
      '<div class="abyz-taxonomy-row-actions">',
      taxonomyRowMenuButton(section.code, "wp-section"),
      '</div>',
      '</div>',
      '</td>'
    ].join("");
    return row;
  }

  function getWpIdFromRow(row) {
    // @MX:NOTE: data-work-package-id 속성 우선 — 운영은 WP permalink가 slug(/work_packages/PROJ6-1)라
    // a[href] 정규식 /\/work_packages\/(\d+)/ 이 매칭되지 않아 wpId=null → dragstart 취소 → move_wp 미동작 (#13).
    var attr = row.getAttribute("data-work-package-id");
    if (attr) {
      var idFromAttr = parseInt(attr, 10);
      if (idFromAttr) {
        return idFromAttr;
      }
    }
    var link = row.querySelector('a[href*="/work_packages/"]');
    if (!link) {
      return null;
    }
    var match = link.getAttribute("href").match(/\/work_packages\/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  function getProjectIdentifierFromRow(row) {
    return projectIdentifierFromRow(row);
  }

  function injectWpDragHandle(wpRow, sectionCode) {
    var existing = wpRow.querySelector(".abyz-drag-handle");
    if (existing) {
      // Re-inject if sectionCode changed (e.g. unassigned WP moved into a section)
      if (existing.dataset.abyzSectionCode === (sectionCode || "")) {
        return;
      }
      existing.remove();
    }
    var firstCell = wpRow.querySelector("td");
    if (!firstCell) {
      return;
    }
    var handle = document.createElement("span");
    handle.className = "abyz-drag-handle";
    handle.dataset.abyzSectionCode = sectionCode || "";
    handle.setAttribute("draggable", "true");
    handle.setAttribute("title", "드래그하여 다른 섹션으로 이동");
    handle.innerHTML = '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="3" cy="2.5" r="1.5"/><circle cx="3" cy="7" r="1.5"/><circle cx="3" cy="11.5" r="1.5"/><circle cx="7" cy="2.5" r="1.5"/><circle cx="7" cy="7" r="1.5"/><circle cx="7" cy="11.5" r="1.5"/></svg>';

    // @MX:NOTE: WP 부모(parent) 설정 버튼 — 클릭 기반, CDK 무관 (#15).
    // 드래그는 OP CDK가 WP 행의 drop을 소비하여 실제 브라우저에서 불가.
    // 기존 taxonomyRowMenuButton(섹션 행) 패턴과 동일하게 클릭으로 parent 설정.
    var wpId = getWpIdFromRow(wpRow);
    if (wpId) {
      var parentBtn = document.createElement("span");
      parentBtn.className = "abyz-parent-btn";
      parentBtn.setAttribute("title", "부모 WP 설정/해제");
      parentBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" xmlns="http://www.w3.org/2000/svg"><path d="M6 1v8M3 6l3 3 3-3M1 11h10"/></svg>';
      // @MX:NOTE: CDK가 자식 WP 행(__hierarchy-group)의 mousedown을 소비하여 click이 발생하지 않음.
      // 기존 드래그 handle(line 807)과 동일한 mousedown stopPropagation 패턴으로 CDK 우회.
      // 하위 WP에서도 버튼 클릭 → 드롭다운 정상 동작 (#15).
      parentBtn.addEventListener("mousedown", function (ev) {
        ev.stopPropagation();
      });
      parentBtn.addEventListener("click", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        showParentSelector(wpRow, wpId);
      });
    }

    // Stop CDK _pointerDown on <tr> from starting its pointer-based drag tracking.
    // CDK registers mousedown on <tr> (bubble phase). Without this, CDK starts
    // its pointer drag from mousedown even though we later stop the dragstart bubble.
    // CDK's pointer drag would then create "새로운 수동 정렬 쿼리" on drop.
    handle.addEventListener("mousedown", function (e) {
      e.stopPropagation();
    });

    handle.addEventListener("dragstart", function (e) {
      var wpId = getWpIdFromRow(wpRow);
      if (!wpId) {
        e.preventDefault();
        return;
      }
      // Prevent OP's own WP sort handler from intercepting this drag
      e.stopImmediatePropagation();
      e.stopPropagation();
      state.drag = { type: "wp", id: wpId, fromCode: sectionCode };
      // @MX:NOTE: 드래그 하나로 drop target 자동 구분 (#15) — WP 행에 drop = 부모(parent) 변경,
      // 섹션 행에 drop = 섹션 이동(move_wp). modifier(Alt) 없이 직관적 드래그.
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "abyz-wp-drag");
      wpRow.classList.add("abyz-dragging");
      // 두 drop target 모두 표시: 다른 WP 행(parent) + 섹션 행(섹션 이동)
      Array.prototype.forEach.call(document.querySelectorAll("tr[data-work-package-id]"), function (r) {
        if (r.getAttribute("data-work-package-id") !== String(wpId)) {
          r.classList.add("abyz-parent-drop-zone");
        }
      });
      Array.prototype.forEach.call(document.querySelectorAll(".abyz-taxonomy-wp-section-row"), function (r) {
        if (!sectionCode || r.getAttribute("data-abyz-taxonomy-code") !== sectionCode) {
          r.classList.add("abyz-drop-zone");
        }
      });
    });

    handle.addEventListener("dragend", function () {
      wpRow.classList.remove("abyz-dragging");
      Array.prototype.forEach.call(document.querySelectorAll(".abyz-drop-zone, .abyz-drag-over, .abyz-parent-drop-zone, .abyz-parent-drag-over"), function (el) {
        el.classList.remove("abyz-drop-zone");
        el.classList.remove("abyz-drag-over");
        el.classList.remove("abyz-parent-drop-zone");
        el.classList.remove("abyz-parent-drag-over");
      });
      state.drag = null;
    });

    firstCell.insertBefore(handle, firstCell.firstChild);
    if (parentBtn) { firstCell.insertBefore(parentBtn, handle.nextSibling); }
  }

  // @MX:NOTE: WP 부모(parent) 설정 드롭다운 — 클릭 기반, CDK 무관 (#15)
  function showParentSelector(wpRow, wpId) {
    // 기존 드롭다운 제거
    var existing = document.getElementById("abyz-parent-selector");
    if (existing) { existing.remove(); }

    // 같은 project의 WP 목록 수집 (state.tree에서)
    var pid = currentProjectIdentifier();
    var allWps = [];
    if (state.tree && state.tree.wpSections) {
      state.tree.wpSections.forEach(function (entry) {
        if (entry.project && entry.project.identifier === pid) {
          (entry.workPackages || []).forEach(function (wp) {
            if (wp.id !== wpId) { allWps.push(wp); }
          });
        }
      });
    }

    // 드롭다운 생성
    var dropdown = document.createElement("div");
    dropdown.id = "abyz-parent-selector";
    dropdown.className = "abyz-parent-selector";
    dropdown.innerHTML = '<div class="abyz-parent-selector-title">부모 WP 선택</div>';

    // "부모 해제" 옵션 — <button> 요소 사용(OP Angular click 소비 방지) + confirm()
    var clearItem = document.createElement("button");
    clearItem.type = "button";
    clearItem.className = "abyz-parent-selector-item";
    clearItem.textContent = "（부모 없음 — 최상위）";
    clearItem.addEventListener("click", function () {
      dropdown.remove();
      if (!confirm("부모를 해제하시겠습니까?")) { return; }
      fetchJson("/abyz_taxonomy/ui/assignments/move_wp_parent", {
        method: "PATCH",
        body: JSON.stringify({ wpId: wpId, toParentId: "" })
      }).then(function () { return refreshTaxonomyViews("taxonomyNode"); })
        .catch(function (err) { window.alert(err.message); });
    });
    dropdown.appendChild(clearItem);

    // WP 목록 — <button> 요소 사용(OP Angular click 소비 방지) + confirm()
    allWps.forEach(function (wp) {
      var item = document.createElement("button");
      item.type = "button";
      item.className = "abyz-parent-selector-item";
      item.textContent = "#" + wp.id + " " + (wp.subject || "").slice(0, 40);
      item.addEventListener("click", function () {
        var toId = wp.id;
        var toLabel = "#" + wp.id + " " + (wp.subject || "").slice(0, 30);
        dropdown.remove();
        if (!confirm("부모 WP를 " + toLabel + "(으)로 설정하시겠습니까?")) { return; }
        fetchJson("/abyz_taxonomy/ui/assignments/move_wp_parent", {
          method: "PATCH",
          body: JSON.stringify({ wpId: wpId, toParentId: toId })
        }).then(function () { return refreshTaxonomyViews("taxonomyNode"); })
          .catch(function (err) { window.alert(err.message); });
      });
      dropdown.appendChild(item);
    });

    if (allWps.length === 0) {
      var empty = document.createElement("div");
      empty.className = "abyz-parent-selector-empty";
      empty.textContent = "같은 프로젝트에 다른 WP가 없습니다";
      dropdown.appendChild(empty);
    }

    // WP 행 아래에 배치 — position:fixed로 viewport 기준 (scroll/stacking context 무관)
    var rect = wpRow.getBoundingClientRect();
    dropdown.style.top = (rect.bottom + 2) + "px";
    dropdown.style.left = (rect.left + 20) + "px";
    document.body.appendChild(dropdown);

    // 외부 클릭 시 닫기 — 드롭다운 내부 클릭은 전파 차단하여 닫히지 않게
    dropdown.addEventListener("click", function (ev) { ev.stopPropagation(); });
    setTimeout(function () {
      document.addEventListener("click", function close() {
        if (document.getElementById("abyz-parent-selector")) { dropdown.remove(); }
        document.removeEventListener("click", close);
      });
    }, 200);
  }

  function injectProjectDragHandle(projectRow, titleCode) {
    var existing = projectRow.querySelector(".abyz-drag-handle");
    if (existing) {
      // Re-inject if titleCode changed (e.g. project moved between titles or unassigned)
      if (existing.dataset.abyzTitleCode === (titleCode || "")) {
        return;
      }
      existing.remove();
    }
    var firstCell = projectRow.querySelector("td");
    if (!firstCell) {
      return;
    }
    var handle = document.createElement("span");
    handle.className = "abyz-drag-handle";
    handle.dataset.abyzTitleCode = titleCode || "";
    handle.setAttribute("draggable", "true");
    handle.setAttribute("title", "드래그하여 다른 타이틀로 이동");
    handle.innerHTML = '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="3" cy="2.5" r="1.5"/><circle cx="3" cy="7" r="1.5"/><circle cx="3" cy="11.5" r="1.5"/><circle cx="7" cy="2.5" r="1.5"/><circle cx="7" cy="7" r="1.5"/><circle cx="7" cy="11.5" r="1.5"/></svg>';

    // Same as WP handle: stop CDK _pointerDown on <tr> from starting pointer drag.
    handle.addEventListener("mousedown", function (e) {
      e.stopPropagation();
    });

    handle.addEventListener("dragstart", function (e) {
      var identifier = getProjectIdentifierFromRow(projectRow);
      if (!identifier) {
        e.preventDefault();
        return;
      }
      // Prevent OP's own sort handler from intercepting this drag
      e.stopImmediatePropagation();
      e.stopPropagation();
      state.drag = { type: "project", id: identifier, fromCode: titleCode };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "abyz-project-drag");
      projectRow.classList.add("abyz-dragging");
      Array.prototype.forEach.call(document.querySelectorAll(".abyz-taxonomy-project-title-row"), function (r) {
        if (r.getAttribute("data-abyz-taxonomy-code") !== titleCode) {
          r.classList.add("abyz-drop-zone");
        }
      });
    });

    handle.addEventListener("dragend", function () {
      projectRow.classList.remove("abyz-dragging");
      Array.prototype.forEach.call(document.querySelectorAll(".abyz-drop-zone, .abyz-drag-over"), function (el) {
        el.classList.remove("abyz-drop-zone");
        el.classList.remove("abyz-drag-over");
      });
      state.drag = null;
    });

    firstCell.insertBefore(handle, firstCell.firstChild);
  }

  function addWpSectionDropHandlers(sectionRow, sectionCode) {
    if (sectionRow.dataset.abyzDropBound === "true") {
      return;
    }
    sectionRow.dataset.abyzDropBound = "true";

    sectionRow.addEventListener("dragover", function (e) {
      if (state.drag && state.drag.type === "wp" && state.drag.fromCode !== sectionCode) {
        e.preventDefault();
        sectionRow.classList.add("abyz-drag-over");
      }
    });

    sectionRow.addEventListener("dragleave", function (e) {
      if (!sectionRow.contains(e.relatedTarget)) {
        sectionRow.classList.remove("abyz-drag-over");
      }
    });

    sectionRow.addEventListener("drop", function (e) {
      e.preventDefault();
      sectionRow.classList.remove("abyz-drag-over");
      if (state.drag && state.drag.type === "wp" && state.drag.fromCode !== sectionCode) {
        var wpId = state.drag.id;
        state.drag = null;
        fetchJson("/abyz_taxonomy/ui/assignments/move_wp", {
          method: "PATCH",
          body: JSON.stringify({ wpId: wpId, toSectionCode: sectionCode })
        }).then(function () {
          return refreshTaxonomyViews("taxonomyNode");
        }).catch(function (err) {
          window.alert(err.message);
        });
      }
    });
  }

  // @MX:NOTE: WP→WP 부모(parent) drop — overlay div 패턴 (#15).
  // WP 행은 OP CDK가 관리하여 HTML5 drop 이벤트가 소비됨. 섹션 행(플러그인 생성)은 동작하지만
  // WP 행은 안 됨. 해결: WP 행 위에 플러그인 관리 overlay div를 주입. CDK는 overlay를 모르므로
  // drop이 확실히 발생. 기존 mousedown stopPropagation(line 794)과 동일한 "CDK보다 먼저 잡기" 원리.
  function addWpParentDropHandlers(wpRow, wpId) {
    if (wpRow.dataset.abyzParentDropBound === "true") {
      return;
    }
    wpRow.dataset.abyzParentDropBound = "true";

    // dragstart 시 overlay 주입, dragend 시 제거 (상시 주입하면 OP 클릭/정렬 방해)
    wpRow.addEventListener("dragenter", function (e) {
      if (!state.drag || state.drag.type !== "wp" || state.drag.id === wpId) { return; }
      if (wpRow.querySelector(".abyz-parent-overlay")) { return; }
      var overlay = document.createElement("div");
      overlay.className = "abyz-parent-overlay";
      overlay.setAttribute("data-abyz-parent-wp-id", wpId);
      // overlay는 WP 행 전체를 덮는 투명 드롭존
      overlay.addEventListener("dragover", function (ev) {
        if (state.drag && state.drag.type === "wp" && state.drag.id !== wpId) {
          ev.preventDefault();
          wpRow.classList.add("abyz-parent-drag-over");
        }
      });
      overlay.addEventListener("dragleave", function (ev) {
        wpRow.classList.remove("abyz-parent-drag-over");
      });
      overlay.addEventListener("drop", function (ev) {
        ev.preventDefault();
        ev.stopPropagation();
        wpRow.classList.remove("abyz-parent-drag-over");
        if (state.drag && state.drag.type === "wp" && state.drag.id !== wpId) {
          var childId = state.drag.id;
          state.drag = null;
          fetchJson("/abyz_taxonomy/ui/assignments/move_wp_parent", {
            method: "PATCH",
            body: JSON.stringify({ wpId: childId, toParentId: wpId })
          }).then(function () {
            return refreshTaxonomyViews("taxonomyNode");
          }).catch(function (err) {
            window.alert(err.message);
          });
        }
      });
      wpRow.appendChild(overlay);
    });

    // 드래그 종료 시 overlay 제거
    wpRow.addEventListener("dragend", function () {
      var ov = wpRow.querySelector(".abyz-parent-overlay");
      if (ov) { ov.remove(); }
      wpRow.classList.remove("abyz-parent-drag-over");
    });
    wpRow.addEventListener("dragleave", function () {
      var ov = wpRow.querySelector(".abyz-parent-overlay");
      if (ov && !wpRow.contains(event.relatedTarget)) { ov.remove(); wpRow.classList.remove("abyz-parent-drag-over"); }
    });
  }

  function addProjectTitleDropHandlers(titleRow, titleCode) {
    if (titleRow.dataset.abyzDropBound === "true") {
      return;
    }
    titleRow.dataset.abyzDropBound = "true";

    titleRow.addEventListener("dragover", function (e) {
      if (state.drag && state.drag.type === "project" && state.drag.fromCode !== titleCode) {
        e.preventDefault();
        titleRow.classList.add("abyz-drag-over");
      }
    });

    titleRow.addEventListener("dragleave", function (e) {
      if (!titleRow.contains(e.relatedTarget)) {
        titleRow.classList.remove("abyz-drag-over");
      }
    });

    titleRow.addEventListener("drop", function (e) {
      e.preventDefault();
      titleRow.classList.remove("abyz-drag-over");
      if (state.drag && state.drag.type === "project" && state.drag.fromCode !== titleCode) {
        var identifier = state.drag.id;
        state.drag = null;
        fetchJson("/abyz_taxonomy/ui/assignments/move_project", {
          method: "PATCH",
          body: JSON.stringify({ projectIdentifier: identifier, toTitleCode: titleCode })
        }).then(function () {
          return refreshTaxonomyViews("taxonomyNode");
        }).catch(function (err) {
          window.alert(err.message);
        });
      }
    });
  }

  var DRAG_HANDLE_SVG = '<svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><circle cx="3" cy="2.5" r="1.5"/><circle cx="3" cy="7" r="1.5"/><circle cx="3" cy="11.5" r="1.5"/><circle cx="7" cy="2.5" r="1.5"/><circle cx="7" cy="7" r="1.5"/><circle cx="7" cy="11.5" r="1.5"/></svg>';

  // @MX:NOTE: sidebar dropdown project drag/drop — mirrors list injectProjectDragHandle/addProjectTitleDropHandlers but for <li> structure (#4)
  function injectProjectSelectDragHandle(item, identifier, titleCode) {
    var guardKey = "abyzProjectSelectDrag";
    if (item.dataset[guardKey] === titleCode) { return; }
    var existing = item.querySelector(".abyz-project-select-drag-handle");
    if (existing) { existing.remove(); }
    item.dataset[guardKey] = titleCode;

    var handle = document.createElement("span");
    handle.className = "abyz-drag-handle abyz-project-select-drag-handle";
    handle.setAttribute("draggable", "true");
    handle.setAttribute("title", "드래그하여 다른 타이틀로 이동");
    handle.innerHTML = DRAG_HANDLE_SVG;

    handle.addEventListener("mousedown", function (e) { e.stopPropagation(); });

    handle.addEventListener("dragstart", function (e) {
      e.stopImmediatePropagation();
      e.stopPropagation();
      state.drag = { type: "project", id: identifier, fromCode: titleCode };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "abyz-project-drag");
      item.classList.add("abyz-dragging");
      Array.prototype.forEach.call(document.querySelectorAll(".abyz-taxonomy-project-select-title"), function (r) {
        if (r.getAttribute("data-abyz-taxonomy-code") !== titleCode) {
          r.classList.add("abyz-drop-zone");
        }
      });
    });

    handle.addEventListener("dragend", function () {
      item.classList.remove("abyz-dragging");
      Array.prototype.forEach.call(document.querySelectorAll(".abyz-drop-zone, .abyz-drag-over"), function (el) {
        el.classList.remove("abyz-drop-zone", "abyz-drag-over");
      });
      state.drag = null;
    });

    item.insertBefore(handle, item.firstChild);
  }

  // @MX:NOTE: sidebar dropdown title li drop handler — accepts project drops, calls move_project (#4)
  function addProjectSelectTitleDropHandlers(titleItem, titleCode) {
    var guardKey = "abyzProjectSelectDrop";
    if (titleItem.dataset[guardKey] === "true") { return; }
    titleItem.dataset[guardKey] = "true";

    titleItem.addEventListener("dragover", function (e) {
      if (state.drag && state.drag.type === "project" && state.drag.fromCode !== titleCode) {
        e.preventDefault();
        titleItem.classList.add("abyz-drag-over");
      }
    });

    titleItem.addEventListener("dragleave", function (e) {
      if (!titleItem.contains(e.relatedTarget)) {
        titleItem.classList.remove("abyz-drag-over");
      }
    });

    titleItem.addEventListener("drop", function (e) {
      e.preventDefault();
      if (state.drag && state.drag.type === "project" && state.drag.fromCode !== titleCode) {
        var identifier = state.drag.id;
        titleItem.classList.remove("abyz-drag-over");
        state.drag = null;
        fetchJson("/abyz_taxonomy/ui/assignments/move_project", {
          method: "PATCH",
          body: JSON.stringify({ projectIdentifier: identifier, toTitleCode: titleCode })
        }).then(function () {
          return refreshTaxonomyViews("taxonomyNode");
        }).catch(function (err) {
          window.alert(err.message);
        });
      }
    });
  }

  function injectNodeReorderHandle(element, nodeCode, nodeType, containerSelector) {
    var guardKey = "abyzReorderHandle" + nodeType;
    if (element.dataset[guardKey]) { return; }
    element.dataset[guardKey] = "true";

    var container = element.querySelector(containerSelector);
    if (!container) { return; }

    var handle = document.createElement("span");
    handle.className = "abyz-drag-handle abyz-reorder-handle";
    handle.setAttribute("draggable", "true");
    handle.setAttribute("title", "드래그하여 순서 변경");
    handle.innerHTML = DRAG_HANDLE_SVG;

    handle.addEventListener("mousedown", function (e) {
      e.stopPropagation();
    });

    handle.addEventListener("dragstart", function (e) {
      e.stopImmediatePropagation();
      e.stopPropagation();
      state.drag = { type: nodeType, code: nodeCode };
      if (nodeType === "title") { state.drag.hierarchyMove = true; }
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", "abyz-reorder-drag");
      element.classList.add("abyz-dragging");

      var selector = nodeType === "title"
        ? ".abyz-taxonomy-project-title-row, .abyz-taxonomy-project-select-title"
        : ".abyz-taxonomy-wp-section-row";

      Array.prototype.forEach.call(document.querySelectorAll(selector), function (r) {
        if (r.getAttribute("data-abyz-taxonomy-code") !== nodeCode) {
          r.classList.add("abyz-drop-zone");
        }
      });
    });

    handle.addEventListener("dragend", function () {
      element.classList.remove("abyz-dragging");
      Array.prototype.forEach.call(
        document.querySelectorAll(".abyz-drop-zone, .abyz-drop-insert-before, .abyz-drop-insert-after"),
        function (el) {
          el.classList.remove("abyz-drop-zone", "abyz-drop-insert-before", "abyz-drop-insert-after");
        }
      );
      state.drag = null;
    });

    container.insertBefore(handle, container.firstChild);
  }

  function addNodeReorderDropHandlers(element, nodeCode, nodeType, siblingsSelector) {
    var guardKey = "abyzReorderDrop" + nodeType;
    if (element.dataset[guardKey]) { return; }
    element.dataset[guardKey] = "true";

    element.addEventListener("dragover", function (e) {
      if (state.drag && state.drag.type === nodeType && state.drag.code !== nodeCode) {
        e.preventDefault();
        var rect = element.getBoundingClientRect();
        element.classList.remove("abyz-drop-insert-before", "abyz-drop-insert-after");
        if (e.clientY < rect.top + rect.height / 2) {
          element.classList.add("abyz-drop-insert-before");
        } else {
          element.classList.add("abyz-drop-insert-after");
        }
      }
    });

    element.addEventListener("dragleave", function (e) {
      if (!element.contains(e.relatedTarget)) {
        element.classList.remove("abyz-drop-insert-before", "abyz-drop-insert-after");
      }
    });

    element.addEventListener("drop", function (e) {
      e.preventDefault();
      if (state.drag && state.drag.type === nodeType && state.drag.code !== nodeCode) {
        var rect = element.getBoundingClientRect();
        var insertBefore = e.clientY < rect.top + rect.height / 2;
        var draggedCode = state.drag.code;
        var beforeCode;

        if (insertBefore) {
          beforeCode = nodeCode;
        } else {
          var siblings = Array.prototype.slice.call(document.querySelectorAll(siblingsSelector));
          var foundTarget = false;
          beforeCode = null;
          for (var i = 0; i < siblings.length; i++) {
            var sibCode = siblings[i].getAttribute("data-abyz-taxonomy-code");
            if (sibCode === draggedCode) { continue; }
            if (foundTarget) {
              beforeCode = sibCode;
              break;
            }
            if (sibCode === nodeCode) { foundTarget = true; }
          }
        }

        element.classList.remove("abyz-drop-insert-before", "abyz-drop-insert-after");
        state.drag = null;

        fetchJson("/abyz_taxonomy/ui/assignments/reorder_node", {
          method: "PATCH",
          body: JSON.stringify({ code: draggedCode, beforeCode: beforeCode || "" })
        }).then(function () {
          return refreshTaxonomyViews("taxonomyNode");
        }).catch(function (err) {
          window.alert(err.message);
        });
      }
    });
  }

  function buildGanttSectionRow(entry, height) {
    var row = document.createElement("div");
    row.className = "abyz-taxonomy-gantt-section-row";
    row.setAttribute("data-abyz-taxonomy-code", entry.section.code);
    row.style.height = Math.max(40, Math.round(height || 40)) + "px";
    row.innerHTML = '<span>' + escapeHtml(entry.section.name) + '</span>';
    return row;
  }

  function renderGanttSectionRows(projectIdentifier) {
    var timelineBody = document.querySelector(".wp-table-timeline--body");
    if (!timelineBody || !state.tree) {
      return;
    }

    Array.prototype.forEach.call(timelineBody.querySelectorAll(".abyz-taxonomy-gantt-section-row"), function (row) {
      row.remove();
    });

    var cellsById = {};
    var assignedCells = [];
    var realCells = Array.prototype.slice.call(timelineBody.children).filter(function (cell) {
      return !cell.classList.contains("abyz-taxonomy-gantt-section-row");
    });

    realCells.forEach(function (cell) {
      var workPackageId = cell.getAttribute("data-work-package-id");
      if (workPackageId) {
        cellsById[workPackageId] = cell;
      }
    });

    var orderedCells = [];
    wpSectionEntries()
      .filter(function (entry) {
        return entry.project && entry.project.identifier === projectIdentifier;
      })
      .forEach(function (entry) {
        var leftSectionRow = document.querySelector(
          '.abyz-taxonomy-wp-section-row[data-abyz-taxonomy-code="' + entry.section.code + '"]'
        );
        orderedCells.push(buildGanttSectionRow(entry, leftSectionRow ? leftSectionRow.getBoundingClientRect().height : 40));

        (entry.workPackages || []).forEach(function (wp) {
          var cell = cellsById[String(wp.id)];
          if (cell) {
            assignedCells.push(cell);
            orderedCells.push(cell);
          }
        });
      });

    realCells.forEach(function (cell) {
      if (assignedCells.indexOf(cell) === -1) {
        orderedCells.push(cell);
      }
    });

    orderedCells.forEach(function (cell) {
      timelineBody.appendChild(cell);
    });
  }

  function renderWpSectionRows() {
    var projectIdentifier = currentProjectIdentifier();
    var table = document.querySelector("table.work-package-table");
    var tbody = table && table.querySelector("tbody.work-package--results-tbody");
    if (!projectIdentifier || !tbody || !state.tree) {
      return;
    }

    var signature = workPackageRenderSignature(tbody, projectIdentifier);
    if (table.dataset.abyzTaxonomySignature === signature) {
      renderGanttSectionRows(projectIdentifier);
      return;
    }

    Array.prototype.forEach.call(tbody.querySelectorAll(".abyz-taxonomy-wp-section-row"), function (row) {
      row.remove();
    });

    var rowsById = workPackageRowMap(tbody);

    var colspan = tableColspan(table, 6);
    var realRows = Array.prototype.slice.call(tbody.querySelectorAll("tr"));
    var orderedRows = [];
    var assignedRows = [];

    wpSectionEntries()
      .filter(function (entry) {
        return entry.project && entry.project.identifier === projectIdentifier;
      })
      .forEach(function (entry) {
        var sectionRow = buildWpSectionRow(entry, colspan);
        addWpSectionDropHandlers(sectionRow, entry.section.code);
        addNodeReorderDropHandlers(sectionRow, entry.section.code, "section", ".abyz-taxonomy-wp-section-row");
        injectNodeReorderHandle(sectionRow, entry.section.code, "section", ".abyz-taxonomy-row-inner");
        orderedRows.push(sectionRow);

        var workPackageRows = (entry.workPackages || []).map(function (wp) {
          return rowsById[String(wp.id)];
        }).filter(Boolean);

        workPackageRows.forEach(function (wpRow) {
          var wpRowId = getWpIdFromRow(wpRow);
          injectWpDragHandle(wpRow, entry.section.code);
          if (wpRowId) { addWpParentDropHandlers(wpRow, wpRowId); }
          assignedRows.push(wpRow);
          orderedRows.push(wpRow);
        });
      });

    realRows.forEach(function (row) {
      if (assignedRows.indexOf(row) === -1) {
        // Skip rows without a WP link — these are Angular mid-render placeholders
        // that have not yet received their <a href> content. Including them here
        // would place them after the last section header (TC-055).
        // They will be picked up on the next refresh cycle once Angular finishes.
        if (!row.querySelector('a[href*="/work_packages/"]')) { return; }
        // Unassigned WPs (created via OP's native UI) also get a drag handle
        // so they can be moved into any section. sectionCode=null means "no section".
        injectWpDragHandle(row, null);
        var unassignedWpId = getWpIdFromRow(row);
        if (unassignedWpId) { addWpParentDropHandlers(row, unassignedWpId); }
        orderedRows.push(row);
      }
    });

    orderedRows.forEach(function (row) {
      tbody.appendChild(row);
    });

    // Store post-render expected signature so Angular CD's removal of section rows
    // triggers a mismatch → re-render on next refresh cycle.
    // Using pre-render signature caused a stuck state: OP removes section rows →
    // DOM matches pre-render sig → SKIP → section rows never restored.
    var postRowSigs = orderedRows.map(function (row) {
      var code = row.getAttribute("data-abyz-taxonomy-code");
      if (code !== null) { return "s:" + code; }
      // @MX:NOTE: getWpIdFromRow 재사용(data-work-package-id 우선) — 운영 slug permalink 대응 (#14)
      var postWpId = getWpIdFromRow(row);
      return postWpId ? "w:" + postWpId : null;
    }).filter(Boolean);
    var postSections = wpSectionEntries()
      .filter(function (e) { return e.project && e.project.identifier === projectIdentifier; })
      .map(function (e) {
        return e.section.code + ":" + (e.workPackages || []).map(function (wp) { return wp.id; }).join(",");
      });
    table.dataset.abyzTaxonomySignature = postRowSigs.join("|") + "::" + postSections.join("|");
    renderGanttSectionRows(projectIdentifier);
  }

  function titleOptions(selectedCode) {
    return projectTitleEntries().map(function (entry) {
      var selected = entry.title.code === selectedCode ? " selected" : "";
      return '<option value="' + escapeHtml(entry.title.code) + '"' + selected + '>' + escapeHtml(entry.title.name) + '</option>';
    }).join("");
  }

  function sectionOptions(projectIdentifier, selectedCode) {
    return wpSectionEntries()
      .filter(function (entry) {
        return entry.project && entry.project.identifier === projectIdentifier;
      })
      .map(function (entry) {
        var selected = entry.section.code === selectedCode ? " selected" : "";
        return '<option value="' + escapeHtml(entry.section.code) + '"' + selected + '>' + escapeHtml(entry.section.name) + '</option>';
      }).join("");
  }

  function closeModal() {
    var existing = document.getElementById("abyz-taxonomy-modal-root");
    if (existing) {
      existing.remove();
    }
  }

  function openModal(kind, context) {
    context = context || {};
    closeCreateMenus();
    var projectIdentifier = currentProjectIdentifier();
    var heading = {
      projectTitle: context.taxonomyType === "program" ? "프로그램 추가" : (context.taxonomyType === "portfolio" ? "포트폴리오 추가" : "타이틀 추가"),
      project: "타이틀 아래 프로젝트 추가",
      wpSection: "섹션 추가",
      workPackage: "섹션 아래 WP 추가"
    }[kind];
    var body = "";

    if (kind === "projectTitle") {
      body = [
        '<label>이름<input name="name" required autocomplete="off"></label>',
        '<label>코드<input name="code" autocomplete="off" placeholder="project.dev.infrastructure"></label>',
        '<input type="hidden" name="taxonomyType" value="' + escapeHtml(context.taxonomyType || "title") + '">'
      ].join("");
    } else if (kind === "project") {
      body = [
        '<label>타이틀<select name="titleCode" required>' + titleOptions(context.code) + '</select></label>',
        '<label>프로젝트 이름<input name="name" required autocomplete="off"></label>',
        '<label>프로젝트 식별자<input name="identifier" autocomplete="off" placeholder="infra-build"></label>'
      ].join("");
    } else if (kind === "wpSection") {
      body = [
        '<input type="hidden" name="projectIdentifier" value="' + escapeHtml(projectIdentifier || "") + '">',
        '<label>섹션 이름<input name="name" required autocomplete="off"></label>',
        '<label>코드<input name="code" autocomplete="off" placeholder="wp.' + escapeHtml(projectIdentifier || "project") + '.mechanical"></label>'
      ].join("");
    } else if (kind === "workPackage") {
      body = [
        '<input type="hidden" name="projectIdentifier" value="' + escapeHtml(projectIdentifier || "") + '">',
        '<label>섹션<select name="sectionCode" required>' + sectionOptions(projectIdentifier, context.code) + '</select></label>',
        '<label>WP 제목<input name="subject" required autocomplete="off"></label>',
        '<label>시작일<input name="startDate" type="date"></label>',
        '<label>완료일<input name="dueDate" type="date"></label>',
        '<label>설명<textarea name="description" rows="3"></textarea></label>'
      ].join("");
    }

    var root = document.createElement("div");
    root.id = "abyz-taxonomy-modal-root";
    root.className = "abyz-taxonomy-modal-backdrop";
    root.innerHTML = [
      '<section class="abyz-taxonomy-modal" role="dialog" aria-modal="true" aria-labelledby="abyz-taxonomy-modal-title">',
      '<header><h2 id="abyz-taxonomy-modal-title">' + heading + '</h2><button type="button" class="button" data-abyz-action="close-modal">닫기</button></header>',
      '<form class="abyz-taxonomy-form" data-kind="' + kind + '">',
      body,
      '<div class="abyz-taxonomy-error" data-abyz-error></div>',
      '</form>',
      '<footer><button type="button" class="button" data-abyz-action="close-modal">취소</button><button type="button" class="button -primary" data-abyz-action="submit-modal">저장</button></footer>',
      '</section>'
    ].join("");

    closeModal();
    document.body.appendChild(root);
    var firstInput = root.querySelector("input:not([type=hidden]), select, textarea");
    if (firstInput) {
      firstInput.focus();
    }
  }

  function formPayload(form) {
    var data = {};
    Array.prototype.forEach.call(form.elements, function (field) {
      if (!field.name) {
        return;
      }
      data[field.name] = field.value;
    });

    if (data.name && !data.code && form.dataset.kind === "projectTitle") {
      data.code = "project." + slug(data.name);
    }
    if (data.name && !data.code && form.dataset.kind === "wpSection") {
      data.code = "wp." + (data.projectIdentifier || "project") + "." + slug(data.name);
    }
    if (data.name && !data.identifier && form.dataset.kind === "project") {
      data.identifier = slug(data.name);
    }
    return data;
  }

  function refreshTaxonomyViews(kind) {
    state.tree = null;
    return loadTree().then(function () {
      renderProjectTitleRows();
      renderProjectSelectTaxonomyRows();
      renderWpSectionRows();
      if (kind === "project" || kind === "workPackage") {
        window.location.reload();
      }
    });
  }

  function submitModal() {
    var form = document.querySelector("#abyz-taxonomy-modal-root form");
    var error = document.querySelector("#abyz-taxonomy-modal-root [data-abyz-error]");
    if (!form) {
      return;
    }

    if (!form.reportValidity()) {
      return;
    }

    var kind = form.dataset.kind;
    var endpoints = {
      projectTitle: "/abyz_taxonomy/ui/project_titles",
      project: "/abyz_taxonomy/ui/projects",
      wpSection: "/abyz_taxonomy/ui/wp_sections",
      workPackage: "/abyz_taxonomy/ui/work_packages"
    };
    var endpoint = endpoints[kind];
    var method = "POST";

    if (error) {
      error.textContent = "";
    }

    fetchJson(endpoint, {
      method: method,
      body: JSON.stringify(formPayload(form))
    }).then(function () {
      closeModal();
      return refreshTaxonomyViews(kind);
    }).catch(function (err) {
      if (error) {
        error.textContent = err.message;
      }
    });
  }

  function deleteTaxonomyNode(code) {
    var node = taxonomyNodeByCode(code);
    if (!node) {
      return;
    }

    var confirmed = window.confirm(taxonomyTypeLabel(node) + " '" + node.name + "'을(를) 삭제합니까?\n실제 Project/WP는 삭제되지 않고 구분 row만 비활성화됩니다.");
    if (!confirmed) {
      return;
    }

    fetchJson("/abyz_taxonomy/ui/nodes/" + encodeURIComponent(code), {
      method: "DELETE"
    }).then(function () {
      return refreshTaxonomyViews("taxonomyNode");
    }).catch(function (err) {
      window.alert(err.message);
    });
  }

  function handleClick(event) {
    var trigger = event.target.closest("[data-abyz-action]");
    if (!trigger) {
      return;
    }

    var action = trigger.getAttribute("data-abyz-action");
    if (action === "close-modal") {
      event.preventDefault();
      closeModal();
    } else if (action === "submit-modal") {
      event.preventDefault();
      submitModal();
    } else if (action === "native-work-package") {
      event.preventDefault();
      closeCreateMenus();
      state.allowNativeWpCreate = true;
      var wpButton = document.querySelector("button.add-work-package");
      if (wpButton) {
        wpButton.click();
      }
    } else if (action === "project-title") {
      event.preventDefault();
      openModal("projectTitle", { taxonomyType: trigger.getAttribute("data-taxonomy-type") || "title" });
    } else if (action === "project-under-title") {
      event.preventDefault();
      closeTaxonomyContextMenus();
      openModal("project", { code: trigger.getAttribute("data-code") });
    } else if (action === "wp-section") {
      event.preventDefault();
      openModal("wpSection");
    } else if (action === "wp-under-section") {
      event.preventDefault();
      closeTaxonomyContextMenus();
      openModal("workPackage", { code: trigger.getAttribute("data-code") });
    } else if (action === "open-node-menu") {
      event.preventDefault();
      openTaxonomyContextMenu(trigger);
    } else if (action === "delete-node") {
      event.preventDefault();
      var code = trigger.getAttribute("data-code");
      closeTaxonomyContextMenus();
      deleteTaxonomyNode(code);
    }
  }

  function interceptCreateButtonClick(event) {
    var wpButton = event.target.closest("button.add-work-package");
    if (wpButton) {
      if (state.allowNativeWpCreate) {
        state.allowNativeWpCreate = false;
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      openWpCreateMenu(wpButton);
      return;
    }

    if (!event.target.closest("#abyz-taxonomy-wp-create-menu") && !event.target.closest("#abyz-taxonomy-modal-root") && !event.target.closest(".abyz-taxonomy-node-menu") && !event.target.closest('[data-abyz-action="open-node-menu"]')) {
      var openMenu = document.getElementById("abyz-taxonomy-wp-create-menu");
      if (openMenu) {
        openMenu.remove();
      }
      closeTaxonomyContextMenus();
    }
  }

  function refresh() {
    enhanceGlobalQuickAddMenu();
    enhanceProjectCreateMenu();
    insertProjectActions();
    insertWorkPackageActions();
    loadTree().then(function () {
      enhanceProjectCreateMenu();
      renderProjectTitleRows();
      renderProjectSelectTaxonomyRows();
      renderWpSectionRows();
    }).catch(function () {
      // Non-admin users should keep the normal OpenProject UI.
    });
  }

  var refreshTimer = null;
  function scheduleRefresh() {
    window.clearTimeout(refreshTimer);
    refreshTimer = window.setTimeout(refresh, 250);
  }

  document.addEventListener("click", interceptCreateButtonClick, true);
  document.addEventListener("click", handleClick);
  document.addEventListener("DOMContentLoaded", refresh);
  document.addEventListener("turbo:load", refresh);

  new MutationObserver(scheduleRefresh).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}());
