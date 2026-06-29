const root = document.documentElement;
const toggle = document.querySelector("[data-menu-toggle]");
const nav = document.querySelector("[data-nav]");
const themeToggle = document.querySelector("[data-theme-toggle]");
const productSearch = document.querySelector("[data-product-search]");
const filterTabs = document.querySelector("[data-filter-tabs]");
const productCards = Array.from(document.querySelectorAll("[data-category]"));
const shortlistList = document.querySelector("[data-shortlist-list]");
const shortlistHeading = document.querySelector("[data-shortlist-heading]");
const enquiryForm = document.querySelector("[data-enquiry-form]");
const statusText = document.querySelector("[data-form-status]");

const shortlist = new Set();

const setTheme = (theme) => {
  root.dataset.theme = theme;
  localStorage.setItem("crossroads-theme", theme);

  if (themeToggle) {
    themeToggle.textContent = theme === "dark" ? "Clean mode" : "Dark mode";
  }
};

const storedTheme = localStorage.getItem("crossroads-theme");
setTheme(storedTheme === "light" ? "light" : "dark");

if (themeToggle) {
  themeToggle.addEventListener("click", () => {
    setTheme(root.dataset.theme === "dark" ? "light" : "dark");
  });
}

if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });

  nav.addEventListener("click", (event) => {
    const target = event.target;

    if (target instanceof HTMLAnchorElement || target === themeToggle) {
      nav.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

const updateProducts = () => {
  const activeFilter = filterTabs?.querySelector(".active")?.dataset.filter || "all";
  const searchTerm = productSearch instanceof HTMLInputElement ? productSearch.value.trim().toLowerCase() : "";

  productCards.forEach((card) => {
    const matchesFilter = activeFilter === "all" || card.dataset.category === activeFilter;
    const matchesSearch = !searchTerm || (card.dataset.search || "").includes(searchTerm);
    card.classList.toggle("is-hidden", !(matchesFilter && matchesSearch));
  });
};

if (filterTabs) {
  filterTabs.addEventListener("click", (event) => {
    const button = event.target;

    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    filterTabs.querySelectorAll("button").forEach((tab) => tab.classList.remove("active"));
    button.classList.add("active");
    updateProducts();
  });
}

if (productSearch) {
  productSearch.addEventListener("input", updateProducts);
}

const updateShortlist = () => {
  document.querySelectorAll("[data-shortlist]").forEach((button) => {
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }

    const item = button.dataset.shortlist || "";
    const isAdded = shortlist.has(item);
    button.classList.toggle("is-added", isAdded);
    button.textContent = isAdded ? "Added" : "Add to shortlist";
  });

  if (!shortlistList || !shortlistHeading) {
    return;
  }

  shortlistList.innerHTML = "";

  if (shortlist.size === 0) {
    shortlistHeading.textContent = "Nothing selected yet.";
    return;
  }

  shortlistHeading.textContent = `${shortlist.size} item${shortlist.size === 1 ? "" : "s"} selected.`;

  shortlist.forEach((item) => {
    const li = document.createElement("li");
    const span = document.createElement("span");
    const remove = document.createElement("button");

    span.textContent = item;
    remove.type = "button";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      shortlist.delete(item);
      updateShortlist();
    });

    li.append(span, remove);
    shortlistList.append(li);
  });
};

document.addEventListener("click", (event) => {
  const button = event.target;

  if (!(button instanceof HTMLButtonElement) || !button.dataset.shortlist) {
    return;
  }

  const item = button.dataset.shortlist;

  if (shortlist.has(item)) {
    shortlist.delete(item);
  } else {
    shortlist.add(item);
  }

  updateShortlist();
});

if (enquiryForm instanceof HTMLFormElement) {
  enquiryForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const data = new FormData(enquiryForm);
    const name = String(data.get("name") || "").trim();
    const email = String(data.get("email") || "").trim();
    const goal = String(data.get("goal") || "").trim();
    const message = String(data.get("message") || "").trim();
    const selectedItems = Array.from(shortlist);
    const subject = `Crossroads consult shortlist from ${name || "website visitor"}`;
    const body = [
      "New Crossroads Holistic Clinic consult checkout",
      "",
      `Name: ${name}`,
      `Email: ${email}`,
      `Goal: ${goal || "Not provided"}`,
      "",
      "Product categories to discuss:",
      selectedItems.length ? selectedItems.map((item) => `- ${item}`).join("\n") : "No shortlist items selected yet.",
      "",
      "Patient notes:",
      message || "No extra notes provided.",
      "",
      "Note: Product selection is for consult preparation only. Suitability and prescribing remain clinical decisions.",
    ].join("\n");

    if (statusText) {
      statusText.textContent = "Opening your email app with the consult details ready.";
    }

    window.location.href = `mailto:hello@crossroadsholisticclinic.com.au?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });
}

updateProducts();
updateShortlist();
