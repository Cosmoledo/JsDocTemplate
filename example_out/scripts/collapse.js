(() => {
	const file = window.location.pathname.split("/").pop();

	document.querySelectorAll("nav > ul > li > ul li").forEach(parent => parent.style.display = "none");

	document.querySelectorAll("nav > ul > li > a[href^='" + file + "']").forEach(parent => {
		parent.parentNode.querySelectorAll("ul li").forEach(elem => elem.style.display = "block");
	});
})();
