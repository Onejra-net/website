/* Onejra Publications — static GitHub Pages reader */
(() => {
  "use strict";

  // The folder name below follows the path supplied in the request: acticles.
  const OWNER = "Onejra-net";
  const REPO = "publications";
  const BRANCH = "main";
  const FOLDER = "acticles";
  const API_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${FOLDER}?ref=${BRANCH}`;
  const REPO_URL = `https://github.com/${OWNER}/${REPO}`;
  const RAW_BASE = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${FOLDER}/`;

  const listEl = document.getElementById("publication-list");
  const searchEl = document.getElementById("search-input");
  const countEl = document.getElementById("results-count");
  const errorEl = document.getElementById("list-error");
  const sortButton = document.getElementById("sort-button");
  const emptyEl = document.getElementById("reader-empty");
  const articleView = document.getElementById("article-view");
  const articleTitle = document.getElementById("article-title");
  const articleCategory = document.getElementById("article-category");
  const articleDate = document.getElementById("article-date");
  const articleContent = document.getElementById("article-content");
  const sourceLink = document.getElementById("source-link");
  const rawLink = document.getElementById("raw-link");

  const repositoryLink = document.getElementById("repository-link");
  if (repositoryLink) {
  repositoryLink.href = REPO_URL;
  }

  let publications = [];
  let selectedPath = null;
  let newestFirst = true;

  const escapeHTML = (value) => String(value ?? "").replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;"
  })[c]);

  function filenameTitle(name) {
    return name.replace(/\.md$/i, "")
      .replace(/^\d{4}[-_]\d{2,}[-_]?\s*/, "")
      .replace(/^\d{4}[-_]\d{2}[-_]\d{2}[-_]?/, "")
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  function parseMetadata(markdown, fileName) {
    const lines = markdown.split(/\r?\n/);
    let title = filenameTitle(fileName);
    let description = "";
    let date = "";
    let category = "Publication";
    let body = markdown;

    // Basic YAML front matter support, e.g. title/date/category/description.
    if (lines[0]?.trim() === "---") {
      const end = lines.findIndex((line, i) => i > 0 && line.trim() === "---");
      if (end > 0) {
        for (const line of lines.slice(1, end)) {
          const match = line.match(/^([A-Za-z_-]+)\s*:\s*(.*?)\s*$/);
          if (!match) continue;
          const key = match[1].toLowerCase();
          const value = match[2].replace(/^["']|["']$/g, "");
          if (key === "title") title = value;
          if (key === "description" || key === "summary" || key === "abstract") description = value;
          if (key === "date" || key === "published") date = value;
          if (key === "category" || key === "type") category = value;
        }
        body = lines.slice(end + 1).join("\n");
      }
    }

    const firstHeading = body.match(/^\s*#\s+(.+?)\s*$/m);
    if (!title || title === filenameTitle(fileName)) {
      if (firstHeading) title = firstHeading[1].replace(/[*_`]/g, "");
    }
    if (!description) {
      description = body.replace(/```[\s\S]*?```/g, " ")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/[#>*_`~|-]/g, " ")
        .replace(/\s+/g, " ").trim().slice(0, 165);
    }
    return { title, description, date, category, body };
  }

  function dateLabel(value, fallback) {
    const date = value ? new Date(value) : null;
    if (date && !Number.isNaN(date.getTime())) {
      return new Intl.DateTimeFormat("en", {year:"numeric", month:"short", day:"numeric"}).format(date);
    }
    const match = fallback.match(/(20\d{2})[-_](\d{2})[-_](\d{2})/);
    return match ? new Intl.DateTimeFormat("en", {year:"numeric",month:"short",day:"numeric"}).format(new Date(`${match[1]}-${match[2]}-${match[3]}T12:00:00Z`)) : "DATE NOT SPECIFIED";
  }

  function sortItems(items) {
    return [...items].sort((a, b) => {
      const da = a.date ? new Date(a.date).getTime() : 0;
      const db = b.date ? new Date(b.date).getTime() : 0;
      const diff = da - db;
      return newestFirst ? (diff || a.name.localeCompare(b.name)) * -1 : (diff || a.name.localeCompare(b.name));
    });
  }

  function renderList() {
    const query = searchEl.value.trim().toLowerCase();
    const filtered = sortItems(publications.filter(p =>
      `${p.title} ${p.description} ${p.category} ${p.name}`.toLowerCase().includes(query)
    ));
    countEl.textContent = `${filtered.length} publication${filtered.length === 1 ? "" : "s"}`;
    listEl.innerHTML = "";
    if (!filtered.length) {
      listEl.innerHTML = '<div class="empty-list">No publications match your search.</div>';
      return;
    }
    for (const item of filtered) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `publication-item${selectedPath === item.path ? " active" : ""}`;
      button.setAttribute("aria-pressed", selectedPath === item.path ? "true" : "false");
      button.innerHTML = `
        <div class="item-top"><span class="item-category">${escapeHTML(item.category)}</span><span class="item-date">${escapeHTML(dateLabel(item.date, item.name))}</span></div>
        <h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(item.description || "Open this publication to read the full text.")}</p>`;
      button.addEventListener("click", () => openPublication(item));
      listEl.appendChild(button);
    }
  }

  async function openPublication(item) {
	selectedPath = item.path;
	renderList();

	emptyEl.style.display = "none";
	articleView.hidden = false;
    articleTitle.textContent = item.title;
    articleCategory.textContent = String(item.category || "PUBLICATION").toUpperCase();
    articleDate.textContent = dateLabel(item.date, item.name).toUpperCase();
    articleContent.innerHTML = '<div class="loading-state"><span class="loader"></span><span>Loading publication text…</span></div>';
    sourceLink.href = item.html_url;
    rawLink.href = item.download_url || `${RAW_BASE}${encodeURIComponent(item.name)}`;
    history.replaceState(null, "", `#${encodeURIComponent(item.name)}`);

    try {
      const response = await fetch(item.download_url || `${RAW_BASE}${encodeURIComponent(item.name)}`);
      if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
      const markdown = await response.text();
      const meta = parseMetadata(markdown, item.name);
      articleTitle.textContent = meta.title;
      articleCategory.textContent = String(meta.category || "PUBLICATION").toUpperCase();
      articleDate.textContent = dateLabel(meta.date || item.date, item.name).toUpperCase();
      if (window.marked) {
        marked.setOptions({ breaks: false, gfm: true });
        articleContent.innerHTML = marked.parse(meta.body);
		
        // Open external links safely in a new tab:
        articleContent.querySelectorAll("a").forEach(a => {
          if (/^https?:/i.test(a.href)) { a.target = "_blank"; a.rel = "noopener noreferrer"; }
        });
      } else {
        articleContent.textContent = meta.body;
      }
      document.title = `${meta.title} — Onejra Publications`;
    } catch (error) {
      articleContent.innerHTML = `<p>Could not load this publication. Please try again or open the original Markdown file on GitHub.</p><p class="error-detail">${escapeHTML(error.message)}</p>`;
    }
    if (window.matchMedia("(max-width: 650px)").matches) {
      document.getElementById("reader").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function loadPublications() {
    try {
      const response = await fetch(API_URL, { headers: { Accept: "application/vnd.github+json" } });
      if (!response.ok) {
        if (response.status === 404) throw new Error(`Folder not found: ${FOLDER}. Check the folder spelling and repository visibility.`);
        if (response.status === 403) throw new Error("GitHub API rate limit reached. Wait a little and reload the page.");
        throw new Error(`GitHub API returned ${response.status}.`);
      }
      const data = await response.json();
      publications = data
        .filter(item => item.type === "file" && /\.md$/i.test(item.name))
        .map(item => ({
          name: item.name,
          path: item.path,
          html_url: item.html_url,
          download_url: item.download_url,
          title: filenameTitle(item.name),
          description: "",
          date: "",
          category: "Publication"
        }));

      if (!publications.length) {
        listEl.innerHTML = '<div class="empty-list">No .md files were found in this folder.</div>';
        countEl.textContent = "0 publications";
        return;
      }

      // Fetch metadata for each Markdown file so title/summary/date can be shown in the list:
      await Promise.all(publications.map(async item => {
        try {
          const r = await fetch(item.download_url);
          if (!r.ok) return;
          const meta = parseMetadata(await r.text(), item.name);
          item.title = meta.title;
          item.description = meta.description;
          item.date = meta.date;
          item.category = meta.category;
        } catch (_) { /* Use filename-based fallback metadata. */ }
      }));

      renderList();
      const hashName = decodeURIComponent(location.hash.slice(1));
      const initial = publications.find(p => p.name === hashName) || sortItems(publications)[0];
      if (initial) openPublication(initial);
    } catch (error) {
      listEl.innerHTML = '<div class="empty-list">The archive could not be loaded.</div>';
      countEl.textContent = "Archive unavailable";
      errorEl.hidden = false;
      errorEl.textContent = `${error.message} The repository and Markdown files must be public for this no-backend setup.`;
    }
  }

  searchEl.addEventListener("input", renderList);
  sortButton.addEventListener("click", () => {
    newestFirst = !newestFirst;
    sortButton.innerHTML = `${newestFirst ? "Newest first" : "Oldest first"} <span>⌄</span>`;
    renderList();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "/" && !["INPUT", "TEXTAREA"].includes(document.activeElement.tagName)) {
      event.preventDefault();
      searchEl.focus();
    }
    if (event.key === "Escape" && document.activeElement === searchEl) {
      searchEl.value = "";
      renderList();
      searchEl.blur();
    }
  });

  loadPublications();
})();
