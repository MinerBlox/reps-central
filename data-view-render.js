// data-view-render.js
// Loads products from a TAB-separated CSV (gemini_products.csv) and renders infinite-scroll cards.
// CSV format:
//   col0: [name](link){price}%category%
//   col1: (ignored)
//   col2: image url
// Requirements from user:
// - Always format price as $xx.xx
// - Replace any ref=... with ref=100201678
// - Status pill always "Available"
// - Category taken from %...% and used lowercase internally

(function () {
  const BATCH_SIZE = 24;
  let PRODUCTS = [];
  let rendered = 0;
  let initialized = false;

  const qs = (sel, root = document) => root.querySelector(sel);

  function capitalize(word) {
    if (!word) return "";
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  function formatPrice(raw) {
    if (raw == null) return "$0.00";
    let s = String(raw).replace(/\$/g, "").replace(/,/g, "").trim();
    const n = Number(s);
    if (!isFinite(n)) return `$${s}`;
    return `$${n.toFixed(2)}`;
  }

  function updateRef(link) {
    try {
      const u = new URL(link);
      // Force the ref param
      u.searchParams.set("ref", "100201678");
      return u.toString();
    } catch {
      return link; // if not a valid URL, return as-is
    }
  }

  // Parse a single TSV line into a product object
  function parseRow(line, index) {
    // Split on TABs only (file is TSV)
    const parts = line.split("\t");
    if (parts.length < 3) return null;

    const col1 = (parts[0] || "").trim();     // [name](link){price}%category%
    // parts[1] is ignored per user
    const image = (parts[2] || "").trim();    // image url

    // Extracters
    const name = (col1.match(/\[([^\]]+)\]/) || [null, ""])[1].trim();
    let link = (col1.match(/\(([^)]+)\)/) || [null, ""])[1].trim();
    const priceRaw = (col1.match(/\{([^}]+)\}/) || [null, ""])[1].trim();
    const category = (col1.match(/%([^%]+)%/) || [null, ""])[1].trim().toLowerCase();

    if (!name) return null;

    if (link) {
      link = updateRef(link);
    }

    const price = formatPrice(priceRaw);

    return {
      id: index + 1,
      name,
      link,
      price,
      category,
      image
    };
  }

  // Fetch and parse the TSV file
  async function loadProducts() {
    const res = await fetch("gemini_products.csv", { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to load gemini_products.csv");
    const text = await res.text();

    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return [];

    // Skip header if present (first row contains letters, not bracket pattern)
    const startIdx = /^\s*\[/.test(lines[0]) ? 0 : 1;

    const out = [];
    for (let i = startIdx; i < lines.length; i++) {
      const row = parseRow(lines[i], out.length);
      if (row) out.push(row);
    }
    return out;
  }

  function createCard(p) {
    const div = document.createElement("div");
    div.className = "card bg-white p-4 rounded-2xl shadow-lg border border-gray-100";
    div.innerHTML = `
      <div class="w-full h-48 mb-4 bg-gray-200 rounded-xl flex items-center justify-center overflow-hidden">
        <img src="${p.image}" alt="${p.name}" class="object-cover w-full h-full"
             onerror="this.onerror=null; this.src='https://placehold.co/400x192/E5E7EB/6B7280?text=IMG';" />
      </div>
      <div class="px-2 pb-2">
        <h3 class="text-xl font-semibold mb-1 truncate text-primary-dark">${p.name}</h3>
        <p class="text-sm text-gray-500 mb-3">Category: ${capitalize(p.category)}</p>
        <div class="flex justify-between items-center mb-4">
          <span class="text-2xl font-bold text-green-600">${p.price}</span>
          <span class="status-pill status-available">Available</span>
        </div>
      </div>
      <div class="border-t border-subtle pt-4 flex justify-between items-center px-2">
        ${p.link
          ? `<a href="${p.link}" target="_blank" rel="noopener" class="text-sm text-accent font-medium hover:underline flex items-center">
               Buy
               <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
             </a>`
          : `<span class="text-sm text-gray-400">Link Checking</span>`
        }
        <span class="text-xs text-gray-400"></span>
      </div>
    `;
    return div;
  }

  let grid, footerEl;

  function renderMore() {
    if (!PRODUCTS || rendered >= PRODUCTS.length) return;
    const end = Math.min(rendered + BATCH_SIZE, PRODUCTS.length);
    for (let i = rendered; i < end; i++) {
      grid.appendChild(createCard(PRODUCTS[i]));
    }
    rendered = end;
    if (footerEl) {
      footerEl.textContent = `Displaying ${rendered.toLocaleString()} of ${PRODUCTS.length.toLocaleString()} total items.`;
    }
  }

  function nearBottom() {
    const scrollY = window.scrollY || window.pageYOffset;
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    const fullH = document.documentElement.scrollHeight;
    return (scrollY + viewportH) > (fullH - 600);
  }

  function onScroll() {
    const dataView = document.getElementById("data-view");
    if (!dataView || dataView.classList.contains("hidden")) return;
    if (nearBottom()) renderMore();
  }

  function initDataView() {
    if (initialized) return;
    const dataView = document.getElementById("data-view");
    if (!dataView) return;

    grid = dataView.querySelector("main");
    if (!grid) {
      grid = document.createElement("main");
      grid.className = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8";
      dataView.appendChild(grid);
    }
    grid.innerHTML = "";

    footerEl = dataView.querySelector("footer");
    if (!footerEl) {
      footerEl = document.createElement("footer");
      footerEl.className = "mt-12 pt-6 text-center text-sm text-gray-500 border-t border-subtle";
      dataView.appendChild(footerEl);
    }

    renderMore();
    initialized = true;
  }

  // Hook into existing navigate(page)
  const originalNavigate = window.navigate;
  window.navigate = function(page) {
    const result = originalNavigate ? originalNavigate(page) : undefined;
    if (page === "data") {
      setTimeout(initDataView, 50);
    }
    return result;
  };

  // Filter dropdown & search (wire up to refresh grid later if needed)
  window.selectOption = function(value, label) {
    const displayLabel = document.getElementById("filterLabel");
    const displayButton = document.getElementById("filterDisplay");
    if (displayLabel) displayLabel.textContent = label;
    if (displayButton) displayButton.setAttribute("data-value", value);

    // Optional: Live filter
    // Rebuild a filtered PRODUCTS view here if you want.
    // For now, we leave it as-is and focus on loading + infinite scroll.
  };

  window.toggleCustomDropdown = function() {
    const optionsContainer = document.getElementById("filterOptions");
    const arrow = document.getElementById("dropdownArrow");
    const isOpen = optionsContainer && optionsContainer.classList.contains("max-h-60");
    if (isOpen) {
      optionsContainer.classList.remove("max-h-60");
      optionsContainer.classList.add("max-h-0");
      if (arrow) arrow.classList.remove("rotate-180");
    } else {
      optionsContainer.classList.remove("max-h-0");
      optionsContainer.classList.add("max-h-60");
      if (arrow) arrow.classList.add("rotate-180");
    }
  };

  // Initial load
  window.addEventListener("load", async () => {
    try {
      PRODUCTS = await loadProducts();
    } catch (err) {
      console.error("Failed to load products:", err);
      PRODUCTS = [];
    }

    // If data view is visible already (rare), init now
    const dataView = document.getElementById("data-view");
    if (dataView && !dataView.classList.contains("hidden")) {
      initDataView();
    }

    // Always keep infinite scroll listener
    window.addEventListener("scroll", onScroll, { passive: true });
  });
})();
