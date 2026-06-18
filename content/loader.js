// Manifest V3 content scripts execute as classic scripts, not ES modules,
// so content-script.js's top-level `import` would throw a SyntaxError if
// loaded directly. Dynamic import() is allowed outside module context and
// always evaluates its target as a module, so it bridges the two.
import(chrome.runtime.getURL("content/content-script.js"));
