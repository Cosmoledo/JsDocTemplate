const searchAttr = "data-search-mode";

function contains(a, m) {
	return (a.textContent || a.innerText || "").toUpperCase().includes(m);
}

document.getElementById("nav-search").addEventListener("keyup", function(event) {
	const search = this.value.toUpperCase();

	if (!search) {
		document.documentElement.removeAttribute(searchAttr);

		document.querySelectorAll("nav > ul > li:not(.level-hide)").forEach(elem => elem.style.display = "block");
		document.querySelectorAll("nav > ul > li > ul li").forEach(elem => elem.style.display = "block");
	} else {
		document.documentElement.setAttribute(searchAttr, "");

		document.querySelectorAll("nav > ul > li").forEach(elem => elem.style.display = "block");
		document.querySelectorAll("nav > ul > li > ul li").forEach(elem => elem.style.display = "none");
		document.querySelectorAll("nav > ul > li > ul a").forEach(elem => {
			if (!contains(elem.parentNode, search))
				return;
			elem.parentNode.style.display = "block";
		});
		document.querySelectorAll("nav > ul > li").forEach(parent => {
			let countSearchA = 0;
			parent.querySelectorAll("a").forEach(elem => {
				if (contains(elem, search))
					countSearchA++;
			});

			let countUl = 0;
			let countUlVisible = 0;
			parent.querySelectorAll("ul").forEach(ulP => {
				if (contains(ulP, search))
					countUl++;

				let children = ulP.children;
				for (let i = 0; i < children.length; i++) {
					let elem = children[i];
					if (elem.style.display !== "none")
						countUlVisible++;
				}
			});

			if (countSearchA === 0 && countUl === 0)
				parent.style.display = "none";
			else if (countSearchA === 0 && countUlVisible === 0)
				parent.style.display = "none";
		});
	}
});
