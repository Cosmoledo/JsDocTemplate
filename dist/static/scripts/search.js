function contains(e,t){return(e.textContent||e.innerText||"").toUpperCase().includes(t)}const searchAttr="data-search-mode";document.getElementById("nav-search").addEventListener("keyup",function(e){const t=this.value.toUpperCase();t?(document.documentElement.setAttribute(searchAttr,""),document.querySelectorAll("nav > ul > li").forEach(e=>e.style.display="block"),document.querySelectorAll("nav > ul > li > ul li").forEach(e=>e.style.display="none"),document.querySelectorAll("nav > ul > li > ul a").forEach(e=>{contains(e.parentNode,t)&&(e.parentNode.style.display="block")}),document.querySelectorAll("nav > ul > li").forEach(e=>{let n=0;e.querySelectorAll("a").forEach(e=>{contains(e,t)&&n++});let l=0,o=0;e.querySelectorAll("ul").forEach(e=>{contains(e,t)&&l++;let n=e.children;for(let e=0;e<n.length;e++){let t=n[e];"none"!==t.style.display&&o++}}),0===n&&0===l?e.style.display="none":0===n&&0===o&&(e.style.display="none")})):(document.documentElement.removeAttribute(searchAttr),document.querySelectorAll("nav > ul > li:not(.level-hide)").forEach(e=>e.style.display="block"),document.querySelectorAll("nav > ul > li > ul li").forEach(e=>e.style.display="block"))});