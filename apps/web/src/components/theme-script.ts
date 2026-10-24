/** Shared by the server layout (inline, pre-paint) and the client ThemeProvider. */
export const STORAGE_KEY = "theme";
export const DARK_QUERY = "(prefers-color-scheme: dark)";

export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${STORAGE_KEY}");var d=p==="dark"||((!p||p==="system")&&window.matchMedia("${DARK_QUERY}").matches);var c=document.documentElement.classList;c.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light"}catch(e){}})()`;
