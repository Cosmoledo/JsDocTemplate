(() => {
	const source = document.getElementsByClassName("prettyprint source linenums");

	if (source && source[0]) {
		const lines = source[0].getElementsByTagName("li");
		const anchorHash = document.location.hash.substring(1);

		for (let i = 0; i < lines.length; i++) {
			const lineId = "line" + i + 1;
			lines[i].id = lineId;
			if (lineId === anchorHash)
				lines[i].className += " selected";
		}
	}
})();
