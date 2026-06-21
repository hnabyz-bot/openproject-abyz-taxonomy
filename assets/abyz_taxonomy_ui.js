(function () {
  "use strict";

  var state = {
    tree: null,
    loading: null,
    allowNativeWpCreate: false
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
    row.setAttribute("data-test-selector", "abyz-taxonomy-project-title-row");
    row.innerHTML = [
      '<td colspan="' + columnCount + '" class="abyz-taxonomy-title-cell">',
      '<div class="abyz-taxonomy-row-inner">',
      '<div class="abyz-taxonomy-row-label">',
      '<span>' + escapeHtml(title.name) + '</span>',
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
      orderedItems.push(buildProjectSelectTitleItem(entry));
      (entry.projects || []).forEach(function (project) {
        var item = itemsByIdentifier[project.identifier];
        if (item) {
          item.classList.add("abyz-taxonomy-project-select-child");
          item.setAttribute("data-abyz-display-parent", entry.title.code);
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
      var projectRows = (entry.projects || []).map(function (project) {
        return rowsByIdentifier[project.identifier];
      }).filter(Boolean);

      orderedRows.push(row);
      projectRows.forEach(function (projectRow) {
        projectRow.classList.add("abyz-taxonomy-project-child-row");
        projectRow.setAttribute("data-abyz-display-parent", entry.title.code);
        decorateProjectChildRow(projectRow);
        assignedRows.push(projectRow);
        orderedRows.push(projectRow);
      });
    });

    realRows.forEach(function (row) {
      if (assignedRows.indexOf(row) === -1) {
        row.classList.remove("abyz-taxonomy-project-child-row");
        row.removeAttribute("data-abyz-display-parent");
        resetProjectChildRow(row);
        orderedRows.push(row);
      }
    });

    orderedRows.forEach(function (row) {
      tbody.appendChild(row);
    });

    table.dataset.abyzTaxonomySignature = signature;
  }

  function workPackageRowMap(tbody) {
    var map = {};
    Array.prototype.forEach.call(tbody.querySelectorAll("tr"), function (row) {
      if (row.classList.contains("abyz-taxonomy-wp-section-row")) {
        return;
      }

      var link = row.querySelector('a[href*="/work_packages/"]');
      if (!link) {
        return;
      }

      var match = link.getAttribute("href").match(/\/work_packages\/(\d+)/);
      if (match) {
        map[match[1]] = row;
      }
    });
    return map;
  }

  function workPackageRenderSignature(tbody, projectIdentifier) {
    var ids = [];
    Array.prototype.forEach.call(tbody.querySelectorAll("tr"), function (row) {
      if (row.classList.contains("abyz-taxonomy-wp-section-row")) {
        return;
      }

      var link = row.querySelector('a[href*="/work_packages/"]');
      var match = link && link.getAttribute("href").match(/\/work_packages\/(\d+)/);
      if (match) {
        ids.push(match[1]);
      }
    });

    var sections = wpSectionEntries()
      .filter(function (entry) {
        return entry.project && entry.project.identifier === projectIdentifier;
      })
      .map(function (entry) {
        return entry.section.code + ":" + entry.section.name + ":" + (entry.workPackages || []).map(function (wp) {
          return wp.id;
        }).join(",");
      });

    return ids.join("|") + "::" + sections.join("|");
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
      '<span>' + escapeHtml(section.name) + '</span>',
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

    var firstRow = tbody.querySelector("tr");
    var rowsById = workPackageRowMap(tbody);
    var colspan = tableColspan(table, 6);

    wpSectionEntries()
      .filter(function (entry) {
        return entry.project && entry.project.identifier === projectIdentifier;
      })
      .forEach(function (entry) {
        var row = buildWpSectionRow(entry, colspan);
        var workPackageRows = (entry.workPackages || []).map(function (wp) {
          return rowsById[String(wp.id)];
        }).filter(Boolean);

        if (workPackageRows.length) {
          tbody.insertBefore(row, workPackageRows[0]);
          workPackageRows.forEach(function (workPackageRow) {
            tbody.insertBefore(workPackageRow, row.nextSibling);
          });
        } else if (firstRow) {
          tbody.insertBefore(row, firstRow);
        } else {
        tbody.appendChild(row);
      }
    });

    table.dataset.abyzTaxonomySignature = signature;
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
      openModal("project", { code: trigger.getAttribute("data-code") });
    } else if (action === "wp-section") {
      event.preventDefault();
      openModal("wpSection");
    } else if (action === "wp-under-section") {
      event.preventDefault();
      openModal("workPackage", { code: trigger.getAttribute("data-code") });
    } else if (action === "open-node-menu") {
      event.preventDefault();
      openTaxonomyContextMenu(trigger);
    } else if (action === "delete-node") {
      event.preventDefault();
      deleteTaxonomyNode(trigger.getAttribute("data-code"));
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
