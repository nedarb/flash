/// <reference path="./global.d.ts" />
import "./webextension-polyfill.js";

import {
  html,
  render,
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from "./standalone.mjs";
import useDebounce from "./useDebounce.mjs";
import useAsyncState from "./hooks/useAsyncState.mjs";
import SearchResultsWrapper from "./components/SearchResultsWrapper.mjs";
import * as ActionNames from "./ActionNames.mjs";

const openSearchDescEl = document.head.querySelector(`link[rel="search"]`);
const favIconEl = document.head.querySelector(`link[rel*="icon"]`);
if (openSearchDescEl) {
  browser.runtime.sendMessage({
    request: "add-search-engine",
    title: document.title,
    url: openSearchDescEl.href,
    favIconUrl: favIconEl?.href
  });
}

const CloseOmniAction = "close-omni";

const Commands = [
  {
    title: "History",
    desc: "Search browsing history",
    type: "command",
    shortcut: "/h",
    searchPrefix: "/history",
    emoji: true,
    emojiChar: "🏛",
  },
  {
    title: "Tabs",
    desc: "Search your open tabs",
    type: "command",
    shortcut: "/t",
    searchPrefix: "/tabs",
  },
  {
    title: "Bookmarks",
    desc: "Search bookmarks",
    type: "command",
    shortcut: "/b",
    searchPrefix: "/bookmarks",
    emoji: true,
    emojiChar: "📕",
  },
  {
    title: "Actions",
    desc: "Search actions",
    type: "command",
    shortcut: "/a",
    searchPrefix: "/actions",
  },
  {
    title: "Remove",
    desc: "Remove a tab or a bookmark",
    type: "command",
    shortcut: "/r",
    searchPrefix: "/remove",
    emoji: true,
    emojiChar: "🧹",
  },
];

function handleAction(action, eventOptions) {
  const openUrl = (url = action.url) =>
    eventOptions?.metaKey ? window.open(url) : window.open(url, "_self");
  switch (action.action) {
    case "scroll-bottom":
      window.scrollTo(0, document.body.scrollHeight);
      break;
    case "scroll-top":
      window.scrollTo(0, 0);
      break;
    case "url":
    case "bookmark":
    case "navigation":
    case "history":
      openUrl();
      break;
    case "fullscreen":
      var elem = document.documentElement;
      elem.requestFullscreen();
      break;
    case "new-tab":
      window.open("");
      break;
    case "email":
      window.open("mailto:");
      break;
    case CloseOmniAction:
      console.debug(`Closing Omni`);
      break;
    default:
      console.error(`NO HANDLER FOR ${action.action}`);
      if (action.url) {
        openUrl();
        return;
      }
  }
}

function HistorySearch({ searchTerm, handleAction }) {
  // const [searched, setSearched] = useState([]);
  const searched = useAsyncState(
    async () => {
      console.log("searching history");
      const query = searchTerm.replace(/\/history\s*/, "");

      console.log("searching history", query);
      const response = await browser.runtime.sendMessage({
        request: "search-history",
        query,
        maxResults: !query ? 30 : 300,
      });
      return response.history;
    },
    [],
    [searchTerm]
  );

  if (!searched) {
    console.log(`!searched!`, searched);
    return null;
  }
  return html`<${SearchResultsWrapper}
    actions=${searched}
    handleAction=${handleAction}
  />`;
}

function BookmarksSearch({ searchTerm, allActions, handleAction }) {
  const searchedActions = useAsyncState(
    async () => {
      const tempvalue = searchTerm.replace("/bookmarks ", "");
      if (tempvalue != "/bookmarks" && tempvalue != "") {
        const query = searchTerm.replace("/bookmarks ", "");
        const response = await browser.runtime.sendMessage({
          request: "search-bookmarks",
          query,
        });
        console.log("got bookmarks", response);
        return response.bookmarks;
      } else {
        return allActions.filter((x) => x.type == "bookmark");
      }
    },
    [],
    [searchTerm, allActions]
  );

  return html`<${SearchResultsWrapper}
    actions=${searchedActions}
    handleAction=${handleAction}
  />`;
}

function RenderCommands({ handleAction }) {
  return html`<${SearchResultsWrapper}
    actions=${Commands}
    handleAction=${handleAction}
  />`;
}

function RemoveList({ searchTerm, actions, handleAction }) {
  const filtered = useMemo(() => {
    const lower = searchTerm.toLowerCase();
    return actions.filter(
      (a) =>
        (a.type === "bookmark" || a.type === "tab") &&
        (a.title.toLowerCase().includes(lower) ||
          a.url?.toLowerCase().includes(lower))
    );
  }, [searchTerm, actions]);
  const doHandle = useCallback(
    (action, options, ...args) => {
      console.log(`Removing ${action.title}`, action);
      handleAction(action, { ...options, request: "remove" }, ...args);
    },
    [actions, handleAction]
  );

  return html`<${SearchResultsWrapper}
    actions=${filtered}
    handleAction=${doHandle}
    selectVerb="Remove"
  />`;
}

function CustomSearch({ handleAction, searchTerm, customAction }) {
  const tempvalue = searchTerm.replace(
    new RegExp("^" + customAction.shortcut + "\\s*", "i"),
    ""
  );
  console.log("custom action search!", customAction, tempvalue);
  const urlTemplate = customAction.url;
  return html`<${SearchResultsWrapper}
    actions=${[
      {
        title: customAction.title,
        desc: tempvalue ? `Search ${customAction.title} for ${tempvalue}` : `Search ${customAction.title}`,
        type: "action",
        url: urlTemplate.replace("{searchTerms}", tempvalue),
        favIconUrl: customAction.favIconUrl,
        action: "url",
        // emoji: true,
        // emojiChar: "🗄",
        keycheck: false,
      },
    ]}
    handleAction=${handleAction}
  />`;
}

function OmniList({ searchTerm, handleAction }) {
  const [allActions, setAllActions] = useState([]);
  const [filteredActions, setFiltered] = useState([]);
  const lowerTerm = searchTerm.toLowerCase();

  const customActions = allActions.filter((a) => a.action === ActionNames.CustomSearch);
  const customAction = customActions.find((a) => lowerTerm.startsWith(a.shortcut.trim().toLowerCase()));

  // console.log("foobar");
  const historySearchResults = useAsyncState(
    async () => {
      if (!searchTerm || searchTerm.startsWith("/") || customAction) {
        return;
      }

      console.log("searching history", searchTerm);
      const response = await browser.runtime.sendMessage({
        request: "search-history",
        query: searchTerm,
        maxResults: 30,
      });
      return response.history;
    },
    [],
    [searchTerm]
  );
  // console.log("tempHistory", tempHistory);

  useEffect(async () => {
    const response = await browser.runtime.sendMessage({
      request: "get-actions",
    });
    // console.log(`get-actions`, response.actions.reduce((map, item) => {
    //   map[item.type] = (map[item.type] || 0) + 1;
    //   return map;
    // }, {}), response.actions);
    setAllActions(response.actions);
  }, []);

  useEffect(() => {
    if (
      lowerTerm.startsWith("/history") ||
      lowerTerm.startsWith("/bookmarks" || customAction)
    ) {
      return;
    }

    if (lowerTerm.startsWith("instagram ")) {
      const tempvalue = searchTerm.replace(/instagram\s*/, "").toLowerCase();
      const url = tempvalue.startsWith("#")
        ? `https://www.instagram.com/explore/tags/${tempvalue}/`
        : `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(
          tempvalue
        )}`;
      setFiltered([
        {
          title: `Search instagram for ${tempvalue}`,
          desc: `Search instagram for ${tempvalue}`,
          type: "action",
          url,
          favIconUrl:
            "https://www.instagram.com/static/images/ico/favicon.ico/36b3ee2d91ed.ico",
          action: "url",
          // emoji: true,
          // emojiChar: "🗄",
          keycheck: false,
        },
      ]);
      return;
    }

    const filters = [];

    if (lowerTerm.startsWith("/tabs")) {
      const tempvalue = searchTerm.replace(/\/tabs\s*/, "").toLowerCase();
      filters.push(
        (a) =>
          a.type === "tab" &&
          (a.title.toLowerCase().includes(tempvalue) ||
            a.url.toLowerCase().includes(tempvalue))
      );
    } else if (lowerTerm.startsWith("/actions")) {
      const tempvalue = lowerTerm.replace(/\/actions\s*/, "");
      filters.push(
        (a) => a.type === "action" && a.title.toLowerCase().includes(tempvalue)
      );
    } else if (lowerTerm.startsWith("/remove")) {
      // $(this).attr("data-type") == "bookmark" ||
      //$(this).attr("data-type") == "tab"
      const tempvalue = lowerTerm.replace(/\/remove\s*/, "");
      filters.push(
        (a) =>
          (a.type === "action" || a.type === "tab") &&
          (a.title.toLowerCase().includes(tempvalue) ||
            a.url?.toLowerCase().includes(tempvalue))
      );
    } else {
      filters.push(
        (action) =>
          action.title.toLowerCase().includes(lowerTerm) ||
          action.url?.toLowerCase().includes(lowerTerm)
      );
    }

    setFiltered(
      allActions.filter((action) =>
        filters.reduce((val, filter) => val && filter(action), true)
      )
    );
  }, [allActions, searchTerm]);

  // check custom action
  if (customAction) {
    return html`<${CustomSearch}
      customAction=${customAction}
      searchTerm=${searchTerm}
      handleAction=${handleAction}
    />`;
  }

  if (searchTerm.startsWith("/remove")) {
    return html`<${RemoveList}
      actions=${allActions}
      searchTerm=${searchTerm.replace(/^\/remove\s*/, "")}
      handleAction=${handleAction}
    />`;
  }

  if (searchTerm.startsWith("/history")) {
    return html`<${HistorySearch}
      searchTerm=${searchTerm}
      handleAction=${handleAction}
    />`;
  }
  if (searchTerm.startsWith("/bookmarks")) {
    return html`<${BookmarksSearch}
      searchTerm=${searchTerm}
      allActions=${allActions}
      handleAction=${handleAction}
    />`;
  }

  if (
    searchTerm.startsWith("/") &&
    !Commands.some((a) => searchTerm.startsWith(a.searchPrefix))
  ) {
    return html`<${RenderCommands} handleAction=${handleAction} />`;
  }

  return html`<${SearchResultsWrapper}
    actions=${[...filteredActions, ...(historySearchResults || [])]}
    handleAction=${handleAction}
  />`;
}

const Shortcuts = {
  "/h": "/history",
  "/t": "/tabs",
  "/b": "/bookmarks",
  "/a": "/actions",
  "/r": "/remove",
};

function MainApp(props) {
  const { showing, handleAction } = props;
  const [search, setSearch] = useState("");
  const debouncedSearchTerm = useDebounce(search, 250);
  const input = useRef(null);
  const onSearchChange = useCallback((e) => {
    e.preventDefault();
    const newValue = e.target.value;
    const shortcut = Shortcuts[newValue];
    if (shortcut) {
      setSearch(shortcut + " ");
      return;
    }
    setSearch(Shortcuts[newValue] || newValue);
  }, []);

  useEffect(() => {
    if (showing) {
      const timeout = setTimeout(
        () => input.current && input.current.focus(),
        100
      );
      return () => clearTimeout(timeout);
    } else {
      setSearch("");
    }
  }, [showing]);

  const doHandle = useCallback(
    (action, ...args) => {
      if (action.searchPrefix) {
        setSearch(action.searchPrefix);
        return;
      }

      setSearch("");
      handleAction(action, ...args);
    },
    [handleAction]
  );

  const onOverlayClick = useCallback(() => {
    handleAction({ action: CloseOmniAction });
  }, [handleAction]);

  return html`<div
    id="omni-extension"
    class="omni-extension ${!showing ? "omni-closing" : ""}"
  >
    <div id="omni-overlay" onClick=${onOverlayClick}></div>
    <div id="omni-wrap">
      ${showing &&
    html`<div id="omni">
        <div id="omni-search" class="omni-search">
          <input
            ref=${input}
            placeholder="Type a command or search"
            value=${search}
            onInput=${onSearchChange}
          />
        </div>
        <!-- OMNI LIST -->
        <${OmniList}
          searchTerm=${debouncedSearchTerm}
          handleAction=${doHandle}
        />
      </div>`}
    </div>
  </div>`;
}

function App() {
  const [isOpen, setIsOpen] = useState(false);
  useEffect(() => {
    // Recieve messages from background
    browser.runtime.onMessage.addListener((message) => {
      if (message.request == "open-omni") {
        setIsOpen((isOpen) => !isOpen);
      }
    });
  }, []);

  useEffect(() => {
    if (isOpen) {
      const onKeyDown = (e) => {
        switch (e.key) {
          case "Escape":
            if (isOpen) {
              setIsOpen(false);
              e.preventDefault();
            }
            break;
        }
      };
      window.addEventListener("keydown", onKeyDown);
      return () => {
        console.debug("unsub - escape");
        window.removeEventListener("keydown", onKeyDown);
      };
    }
  }, [isOpen]);

  const actionHandler = useCallback(async (action, eventOptions) => {
    setIsOpen(false);

    console.log(`HANDLING ACTION!`, action, eventOptions);
    if (action.action === "history" && action.url) {
      handleAction(action, eventOptions);
      return;
    }

    const response = await browser.runtime.sendMessage({
      request: eventOptions?.request || action.action,
      tab: action,
      action,
    });
    if (response === false) {
      console.warn(`NOTHING DONE IN BG FOR ${action.action}`, action);
      handleAction(action, eventOptions);
    }
  }, []);

  return html`<${MainApp} showing=${isOpen} handleAction=${actionHandler} />`;
}

render(html`<${App} />`, document.getElementById("omni-extension-wrapper"));
