(function () {
  "use strict";

  var state = {
    tree: null,
    loading: null
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

  function insertProjectActions() {
    var page = document.querySelector(".project-list-page");
    if (!page || document.getElementById("abyz-taxonomy-project-actions")) {
      return;
    }

    var hostButton = page.querySelector('[data-test-selector="workspace-new-button"]');
    var host = hostButton && hostButton.parentElement ? hostButton.parentElement : page;
    var wrap = document.createElement("div");
    wrap.id = "abyz-taxonomy-project-actions";
    wrap.className = "abyz-taxonomy-actions -project";
    wrap.setAttribute("data-test-selector", "abyz-taxonomy-project-actions");
    wrap.innerHTML = [
      '<button type="button" class="button" data-abyz-action="project-title" data-taxonomy-type="portfolio">포트폴리오 추가</button>',
      '<button type="button" class="button" data-abyz-action="project-title" data-taxonomy-type="title">타이틀 추가</button>',
      '<button type="button" class="button" data-abyz-action="project-title" data-taxonomy-type="program">프로그램 추가</button>',
      '<button type="button" class="button -primary" data-abyz-action="project-under-title">프로젝트 추가</button>'
    ].join("");

    if (host === page) {
      page.insertBefore(wrap, page.firstElementChild);
    } else {
      host.insertAdjacentElement("afterend", wrap);
    }
  }

  function insertWorkPackageActions() {
    if (!currentProjectIdentifier() || document.getElementById("abyz-taxonomy-wp-actions")) {
      return;
    }

    var createButton = document.querySelector(".wp-create-button");
    if (!createButton) {
      return;
    }

    var host = createButton.closest("li.toolbar-item") || createButton;
    var wrap = document.createElement(host.tagName.toLowerCase() === "li" ? "li" : "div");
    wrap.id = "abyz-taxonomy-wp-actions";
    wrap.className = host.tagName.toLowerCase() === "li" ? "toolbar-item abyz-taxonomy-actions" : "abyz-taxonomy-actions";
    wrap.setAttribute("data-test-selector", "abyz-taxonomy-wp-actions");
    wrap.innerHTML = [
      '<button type="button" class="button" data-abyz-action="wp-section">섹션 추가</button>',
      '<button type="button" class="button" data-abyz-action="wp-under-section">섹션 아래 WP</button>'
    ].join("");
    host.insertAdjacentElement("afterend", wrap);
  }

  function projectRowMap(tbody) {
    var map = {};
    Array.prototype.forEach.call(tbody.querySelectorAll("tr"), function (row) {
      if (row.classList.contains("abyz-taxonomy-project-title-row")) {
        return;
      }

      var link = row.querySelector('a[href*="/projects/"]');
      if (!link) {
        return;
      }

      var match = link.getAttribute("href").match(/\/projects\/([^/?#]+)/);
      if (match) {
        map[decodeURIComponent(match[1])] = row;
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

      var link = row.querySelector('a[href*="/projects/"]');
      var match = link && link.getAttribute("href").match(/\/projects\/([^/?#]+)/);
      if (match) {
        identifiers.push(decodeURIComponent(match[1]));
      }
    });

    var titles = projectTitleEntries().map(function (entry) {
      return entry.title.code + ":" + (entry.projects || []).map(function (project) {
        return project.identifier;
      }).join(",");
    });

    return identifiers.join("|") + "::" + titles.join("|");
  }

  function buildProjectTitleRow(entry, colspan) {
    var title = entry.title;
    var count = entry.projects ? entry.projects.length : 0;
    var row = document.createElement("tr");
    row.className = "abyz-taxonomy-project-title-row";
    row.setAttribute("data-abyz-taxonomy-code", title.code);
    row.setAttribute("data-test-selector", "abyz-taxonomy-project-title-row");
    row.innerHTML = [
      '<td colspan="' + colspan + '" class="abyz-taxonomy-title-cell">',
      '<div class="abyz-taxonomy-row-inner">',
      '<div class="abyz-taxonomy-row-label">',
      '<span>' + escapeHtml(title.name) + '</span>',
      '<span class="abyz-taxonomy-row-meta">project_title, 실제 Project 아님, ' + count + '개 Project</span>',
      '</div>',
      '<div class="abyz-taxonomy-row-actions">',
      '<button type="button" class="button" data-abyz-action="project-under-title" data-code="' + escapeHtml(title.code) + '">프로젝트 추가</button>',
      '</div>',
      '</div>',
      '</td>'
    ].join("");
    return row;
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

    var firstRow = tbody.querySelector("tr");
    var rowsByIdentifier = projectRowMap(tbody);
    var colspan = tableColspan(table, 4);

    projectTitleEntries().forEach(function (entry) {
      var row = buildProjectTitleRow(entry, colspan);
      var projectRows = (entry.projects || []).map(function (project) {
        return rowsByIdentifier[project.identifier];
      }).filter(Boolean);

      if (projectRows.length) {
        tbody.insertBefore(row, projectRows[0]);
        projectRows.forEach(function (projectRow) {
          tbody.insertBefore(projectRow, row.nextSibling);
        });
      } else if (firstRow) {
        tbody.insertBefore(row, firstRow);
      } else {
        tbody.appendChild(row);
      }
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
        return entry.section.code + ":" + (entry.workPackages || []).map(function (wp) {
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
      '<span class="abyz-taxonomy-row-meta">wp_section, 실제 WP 아님, ' + count + '개 WP</span>',
      '</div>',
      '<div class="abyz-taxonomy-row-actions">',
      '<button type="button" class="button" data-abyz-action="wp-under-section" data-code="' + escapeHtml(section.code) + '">WP 추가</button>',
      '</div>',
      '</div>',
      '</td>'
    ].join("");
    return row;
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

    if (error) {
      error.textContent = "";
    }

    fetchJson(endpoints[kind], {
      method: "POST",
      body: JSON.stringify(formPayload(form))
    }).then(function () {
      closeModal();
      state.tree = null;
      return loadTree();
    }).then(function () {
      renderProjectTitleRows();
      renderWpSectionRows();
      if (kind === "project" || kind === "workPackage") {
        window.location.reload();
      }
    }).catch(function (err) {
      if (error) {
        error.textContent = err.message;
      }
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
    }
  }

  function refresh() {
    insertProjectActions();
    insertWorkPackageActions();
    loadTree().then(function () {
      renderProjectTitleRows();
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

  document.addEventListener("click", handleClick);
  document.addEventListener("DOMContentLoaded", refresh);
  document.addEventListener("turbo:load", refresh);

  new MutationObserver(scheduleRefresh).observe(document.documentElement, {
    childList: true,
    subtree: true
  });
}());
