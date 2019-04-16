"use strict";

const doop = require("jsdoc/util/doop");
const fs = require("jsdoc/fs");
const helper = require("jsdoc/util/templateHelper");
const logger = require("jsdoc/util/logger");
const path = require("jsdoc/path");
const taffy = require("taffydb").taffy;
const template = require("jsdoc/template");

const htmlsafe = helper.htmlsafe;
const linkto = helper.linkto;
const resolveAuthorLinks = helper.resolveAuthorLinks;
const hasOwnProp = Object.prototype.hasOwnProperty;

let data;
let view;
let outdir = path.normalize(env.opts.destination);

function copyFile(source, target, cb) {
	let cbCalled = false;

	const rd = fs.createReadStream(source);
	const wr = fs.createWriteStream(target);

	rd.on("error", err => done(err));
	wr.on("error", err => done(err));
	wr.on("close", () => done());
	rd.pipe(wr);

	function done(err) {
		if (cbCalled)
			return;
		cb(err);
		cbCalled = true;
	}
}

function find(spec) {
	return helper.find(data, spec);
}

function tutoriallink(tutorial) {
	return helper.toTutorial(tutorial, null, {
		classname: "disabled",
		prefix: "Tutorial: ",
		tag: "em"
	});
}

function getAncestorLinks(doclet) {
	return helper.getAncestorLinks(data, doclet);
}

function hashToLink(doclet, hash) {
	if (!/^(#.+)/.test(hash))
		return hash;

	const url = helper.createLink(doclet).replace(/(#.+|$)/, hash);

	return `<a href="${url}">${hash}</a>`;
}

function needsSignature(doclet) {
	let needsSig = false;

	if (doclet.kind === "function" || doclet.kind === "class" && !doclet.hideconstructor)
		needsSig = true;
	else if (doclet.kind === "typedef" && doclet.type && doclet.type.names &&
		doclet.type.names.length) {
		for (let i = 0, l = doclet.type.names.length; i < l; i++)
			if (doclet.type.names[i].toLowerCase() === "function") {
				needsSig = true;
				break;
			}
	} else if (doclet.kind === "namespace" && doclet.meta && doclet.meta.code &&
		doclet.meta.code.type && doclet.meta.code.type.match(/[Ff]unction/)) {
		needsSig = true;
	}
	return needsSig;
}

function getSignatureAttributes(item) {
	const attributes = [];

	if (item.optional)
		attributes.push("opt");
	if (item.nullable === true)
		attributes.push("nullable");
	else if (item.nullable === false)
		attributes.push("non-null");
	return attributes;
}

function updateItemName(item) {
	const attributes = getSignatureAttributes(item);
	let itemName = item.name || "";

	if (item.variable)
		itemName = "&hellip;" + itemName;
	if (attributes && attributes.length)
		itemName = `${itemName}<span class="signature-attributes">${attributes.join(", ")}</span>`;
	return itemName;
}

function addParamAttributes(params) {
	return params
		.filter(param => param.name && param.name.indexOf(".") === -1)
		.map(updateItemName);
}

function buildItemTypeStrings(item) {
	const types = [];

	if (item && item.type && item.type.names)
		item.type.names.forEach(name => types.push(linkto(name, htmlsafe(name))));
	return types;
}

function buildAttribsString(attribs) {
	let attribsString = "";

	if (attribs && attribs.length)
		attribsString = htmlsafe(`(${attribs.join(", ")}) `);
	return attribsString;
}

function addNonParamAttributes(items) {
	let types = [];

	items.forEach(item => types = types.concat(buildItemTypeStrings(item)));
	return types;
}

function addSignatureParams(f) {
	const params = f.params ? addParamAttributes(f.params) : [];

	f.signature = `${f.signature || ""}(${params.join(", ")})`;
}

function addSignatureReturns(f) {
	const attribs = [];
	const source = f.yields || f.returns;
	let attribsString = "";
	let returnTypes = [];
	let returnTypesString = "";

	if (source) {
		source.forEach(item => {
			helper.getAttribs(item).forEach(attrib => {
				if (attribs.indexOf(attrib) === -1)
					attribs.push(attrib);
			});
		});

		attribsString = buildAttribsString(attribs);
	}

	if (source)
		returnTypes = addNonParamAttributes(source);
	if (returnTypes.length)
		returnTypesString = ` &rarr; ${attribsString}{${returnTypes.join("|")}}`;
	f.signature = `<span class="signature">${f.signature || ""}</span><span class="type-signature">${returnTypesString}</span>`;
}

function addSignatureTypes(f) {
	const types = f.type ? buildItemTypeStrings(f) : [];

	f.signature = `${f.signature || ""}<span class="type-signature">${types.length ? " :" + types.join("|") : ""}</span>`;
}

function addAttribs(f) {
	const attribsString = buildAttribsString(helper.getAttribs(f));

	f.attribs = `<span class="type-signature">${attribsString}</span>`;
}

function shortenPaths(files, commonPrefix) {
	Object.keys(files).forEach(file => files[file].shortened = files[file].resolved.replace(commonPrefix, "").replace(/\\/g, "/"));
	return files;
}

function getPathFromDoclet(doclet) {
	if (!doclet.meta)
		return null;

	return doclet.meta.path && doclet.meta.path !== "null" ? path.join(doclet.meta.path, doclet.meta.filename) : doclet.meta.filename;
}

function generate(type, title, docs, filename, resolveLinks) {
	resolveLinks = resolveLinks === false ? false : true;

	const docData = {
		docs,
		title,
		type
	};

	const outpath = path.join(outdir, filename);
	let html = view.render("container.tmpl", docData);

	if (resolveLinks)
		html = helper.resolveLinks(html);

	fs.writeFileSync(outpath, html, "utf8");
}

function generateSourceFiles(sourceFiles, encoding) {
	encoding = encoding || "utf8";
	Object.keys(sourceFiles).forEach(file => {
		let source;
		const sourceOutfile = helper.getUniqueFilename(sourceFiles[file].shortened);

		helper.registerLink(sourceFiles[file].shortened, sourceOutfile);

		try {
			source = {
				code: helper.htmlsafe(fs.readFileSync(sourceFiles[file].resolved, encoding)),
				kind: "source"
			};
		} catch (e) {
			logger.error("Error while generating source file %s: %s", file, e.message);
		}

		generate("Source", sourceFiles[file].shortened, [source], sourceOutfile, false);
	});
}

function attachModuleSymbols(doclets, modules) {
	const symbols = {};

	doclets.forEach(symbol => {
		symbols[symbol.longname] = symbols[symbol.longname] || [];
		symbols[symbol.longname].push(symbol);
	});

	return modules.map(module => {
		if (symbols[module.longname]) {
			module.modules = symbols[module.longname]
				.filter(symbol => symbol.description || symbol.kind === "class")
				.map(symbol => {
					symbol = doop(symbol);

					if (symbol.kind === "class" || symbol.kind === "function" && !symbol.hideconstructor)
						symbol.name = symbol.name.replace("module:", "(require('") + "'))";

					return symbol;
				});
		}
	});
}

function buildMemberNav(items, itemHeading, itemsSeen, linktoFn) {
	let nav = "";

	if (items && items.length) {
		const jsdoctemplate = env && env.conf && env.conf.jsdoctemplate || {};
		const level = typeof jsdoctemplate.navLevel === "number" && jsdoctemplate.navLevel >= 0 ? jsdoctemplate.navLevel : Infinity;
		let itemsNav = "";

		items.forEach(function(item) {
			const methods = find({
				kind: "function",
				memberof: item.longname
			});
			const members = find({
				kind: "member",
				memberof: item.longname
			});
			const conf = env && env.conf || {};
			let classes = "";
			let displayName;

			if (jsdoctemplate.private === false && item.access === "private")
				return;

			if (item.ancestors && item.ancestors.length > level)
				classes += "level-hide";

			classes = classes ? ` class="${classes}"` : "";
			itemsNav += `<li${classes}>`;
			if (!hasOwnProp.call(item, "longname"))
				itemsNav += linktoFn("", item.name);
			else if (!hasOwnProp.call(itemsSeen, item.longname)) {
				if (conf.templates.default.useLongnameInNav)
					displayName = item.longname;
				else
					displayName = item.name;

				itemsNav += linktoFn(item.longname, displayName.replace(/\b(module|event):/g, ""));

				if (jsdoctemplate.static && members.find(m => m.scope === "static")) {
					itemsNav += "<ul class='members'>";

					members.forEach(member => {
						if (member.scope !== "static") // TODO Original: !member.scope === "static"
							return;
						itemsNav += "<li data-type='member'";
						if (jsdoctemplate.collapse)
							itemsNav += " style='display: none;'";
						itemsNav += ">" + linkto(member.longname, member.name) + "</li>";
					});

					itemsNav += "</ul>";
				}

				if (methods.length) {
					itemsNav += "<ul class='methods'>";

					methods.forEach(method => {
						itemsNav += "<li data-type='method'";
						if (jsdoctemplate.collapse)
							itemsNav += " style='display: none;'";
						itemsNav += ">" + linkto(method.longname, method.name) + "</li>";
					});

					itemsNav += "</ul>";
				}

				itemsSeen[item.longname] = true;
			}
			itemsNav += "</li>";
		});

		if (itemsNav !== "")
			nav += `<h3>${itemHeading}</h3><ul>${itemsNav}</ul>`;
	}

	return nav;
}

function linktoTutorial(longName, name) {
	return tutoriallink(name);
}

function linktoExternal(longName, name) {
	return linkto(longName, name.replace(/(^"|"$)/g, ""));
}

function buildNav(members) {
	let nav = "<h2><a href='index.html'>Home</a></h2>";
	const seen = {};
	const jsdoctemplate = env && env.conf && env.conf.jsdoctemplate || {};
	if (jsdoctemplate.menu)
		for (const menu in jsdoctemplate.menu) {
			nav += "<h2><a ";
			for (const attr in jsdoctemplate.menu[menu])
				nav += attr + `="${jsdoctemplate.menu[menu][attr]}"`;
			nav += ">" + menu + "</a></h2>";
		}

	const defaultOrder = ["Classes", "Modules", "Externals", "Events", "Namespaces", "Mixins", "Tutorials", "Interfaces"];
	const order = jsdoctemplate.sectionOrder || defaultOrder;
	const sections = {
		Classes: buildMemberNav(members.classes, "Classes", seen, linkto),
		Events: buildMemberNav(members.events, "Events", seen, linkto),
		Externals: buildMemberNav(members.externals, "Externals", seen, linktoExternal),
		Interfaces: buildMemberNav(members.interfaces, "Interfaces", seen, linkto),
		Mixins: buildMemberNav(members.mixins, "Mixins", seen, linkto),
		Modules: buildMemberNav(members.modules, "Modules", {}, linkto),
		Namespaces: buildMemberNav(members.namespaces, "Namespaces", seen, linkto),
		Tutorials: buildMemberNav(members.tutorials, "Tutorials", {}, linktoTutorial)
	};
	order.forEach(member => nav += sections[member]);

	if (members.globals.length) {
		let globalNav = "";

		members.globals.forEach(g => {
			if ((jsdoctemplate.typedefs || g.kind !== "typedef") && !hasOwnProp.call(seen, g.longname))
				globalNav += "<li>" + linkto(g.longname, g.name) + "</li>";

			seen[g.longname] = true;
		});

		if (globalNav)
			nav += "<h3>Global</h3><ul>" + globalNav + "</ul>";
		else
			nav += "<h3>" + linkto("global", "Global") + "</h3>";
	}

	return nav;
}

exports.publish = function(taffyData, opts, tutorials) {
	const jsdoctemplate = env && env.conf && env.conf.jsdoctemplate || {};
	data = taffyData;

	const conf = env.conf.templates || {};
	conf.default = conf.default || {};

	const templatePath = path.normalize(opts.template);
	view = new template.Template(path.join(templatePath, "tmpl"));

	const indexUrl = helper.getUniqueFilename("index");

	const globalUrl = helper.getUniqueFilename("global");
	helper.registerLink("global", globalUrl);

	view.layout = conf.default.layoutFile ? path.getResourcePath(path.dirname(conf.default.layoutFile), path.basename(conf.default.layoutFile)) : "layout.tmpl";

	helper.setTutorials(tutorials);

	data = helper.prune(data);

	if (jsdoctemplate.sort !== false)
		data.sort("longname, version, since");
	helper.addEventListeners(data);

	let sourceFiles = {};
	const sourceFilePaths = [];
	data().each(doclet => {
		if (jsdoctemplate.removeQuotes) {
			if (jsdoctemplate.removeQuotes === "all") {
				if (doclet.name) {
					doclet.name = doclet.name.replace(/"/g, "");
					doclet.name = doclet.name.replace(/'/g, "");
				}
				if (doclet.longname) {
					doclet.longname = doclet.longname.replace(/"/g, "");
					doclet.longname = doclet.longname.replace(/'/g, "");
				}
			} else if (jsdoctemplate.removeQuotes === "trim") {
				if (doclet.name) {
					doclet.name = doclet.name.replace(/^"(.*)"$/, "$1");
					doclet.name = doclet.name.replace(/^'(.*)'$/, "$1");
				}
				if (doclet.longname) {
					doclet.longname = doclet.longname.replace(/^"(.*)"$/, "$1");
					doclet.longname = doclet.longname.replace(/^'(.*)'$/, "$1");
				}
			}
		}
		doclet.attribs = "";

		if (doclet.examples) {
			doclet.examples = doclet.examples.map(example => {
				let caption;
				let code;

				if (example && example.match(/^\s*<caption>([\s\S]+?)<\/caption>(\s*[\n\r])([\s\S]+)$/i)) {
					caption = RegExp.$1;
					code = RegExp.$3;
				}

				return {
					caption: caption || "",
					code: code || example || ""
				};
			});
		}
		if (doclet.see)
			doclet.see.forEach((seeItem, i) => doclet.see[i] = hashToLink(doclet, seeItem));

		if (doclet.meta) {
			let sourcePath = getPathFromDoclet(doclet);
			sourceFiles[sourcePath] = {
				resolved: sourcePath,
				shortened: null
			};
			if (sourceFilePaths.indexOf(sourcePath) === -1)
				sourceFilePaths.push(sourcePath);
		}
	});

	const packageInfo = (find({
		kind: "package"
	}) || [])[0];
	if (packageInfo && packageInfo.name)
		outdir = path.join(outdir, packageInfo.name, (packageInfo.version || ""));

	fs.mkPath(outdir);

	const fromDir = path.join(templatePath, "static");
	const staticFiles = fs.ls(fromDir, 3);

	staticFiles.forEach(fileName => {
		const toDir = fs.toDir(fileName.replace(fromDir, outdir));
		fs.mkPath(toDir);
		copyFile(fileName, path.join(toDir, path.basename(fileName)), err => err && console.error(err));
	});

	let staticFilePaths;
	let staticFileFilter;
	let staticFileScanner;
	if (conf.default.staticFiles) {
		staticFilePaths = conf.default.staticFiles.include || conf.default.staticFiles.paths || [];
		staticFileFilter = new(require("jsdoc/src/filter")).Filter(conf.default.staticFiles);
		staticFileScanner = new(require("jsdoc/src/scanner")).Scanner();

		staticFilePaths.forEach(filePath => {
			const extraStaticFiles = staticFileScanner.scan([filePath], 10, staticFileFilter);

			extraStaticFiles.forEach(fileName => {
				const sourcePath = fs.toDir(filePath);
				const toDir = fs.toDir(fileName.replace(sourcePath, outdir));
				fs.mkPath(toDir);
				copyFile(fileName, path.join(toDir, path.basename(fileName)), err => err && console.error(err));
			});
		});
	}

	if (sourceFilePaths.length)
		sourceFiles = shortenPaths(sourceFiles, path.commonPrefix(sourceFilePaths));

	data().each(doclet => {
		const url = helper.createLink(doclet);
		helper.registerLink(doclet.longname, url);

		if (doclet.meta) {
			let docletPath = getPathFromDoclet(doclet);
			docletPath = sourceFiles[docletPath].shortened;
			if (docletPath)
				doclet.meta.shortpath = docletPath;
		}
	});

	data().each(doclet => {
		const url = helper.longnameToUrl[doclet.longname];

		if (url.indexOf("#") > -1)
			doclet.id = helper.longnameToUrl[doclet.longname].split(/#/).pop();
		else
			doclet.id = doclet.name;

		if (needsSignature(doclet)) {
			addSignatureParams(doclet);
			addSignatureReturns(doclet);
			addAttribs(doclet);
		}
	});

	data().each(doclet => {
		doclet.ancestors = getAncestorLinks(doclet);

		if (doclet.kind === "member") {
			addSignatureTypes(doclet);
			addAttribs(doclet);
		}

		if (doclet.kind === "constant") {
			addSignatureTypes(doclet);
			addAttribs(doclet);
			doclet.kind = "member";
		}
	});

	const members = helper.getMembers(data);
	members.tutorials = tutorials.children;

	const outputSourceFiles = conf.default && conf.default.outputSourceFiles !== false ? true : false;

	view.find = find;
	view.linkto = linkto;
	view.resolveAuthorLinks = resolveAuthorLinks;
	view.tutoriallink = tutoriallink;
	view.htmlsafe = htmlsafe;
	view.outputSourceFiles = outputSourceFiles;

	view.nav = buildNav(members);
	attachModuleSymbols(find({
		longname: {
			left: "module:"
		}
	}), members.modules);

	if (outputSourceFiles)
		generateSourceFiles(sourceFiles, opts.encoding);

	if (members.globals.length)
		generate("", "Global", [{
			kind: "globalobj"
		}], globalUrl);

	const files = find({
		kind: "file"
	});
	const packages = find({
		kind: "package"
	});

	generate("", "Home",
		packages.concat(
			[{
				kind: "mainpage",
				longname: (opts.mainpagetitle) ? opts.mainpagetitle : "Main Page",
				readme: opts.readme
			}]
		).concat(files),
		indexUrl);

	const classes = taffy(members.classes);
	const modules = taffy(members.modules);
	const namespaces = taffy(members.namespaces);
	const mixins = taffy(members.mixins);
	const externals = taffy(members.externals);
	const interfaces = taffy(members.interfaces);

	Object.keys(helper.longnameToUrl).forEach(longname => {
		const myModules = helper.find(modules, {
			longname: longname
		});
		if (myModules.length)
			generate("Module", myModules[0].name, myModules, helper.longnameToUrl[longname]);

		const myClasses = helper.find(classes, {
			longname: longname
		});
		if (myClasses.length)
			generate("Class", myClasses[0].name, myClasses, helper.longnameToUrl[longname]);

		const myNamespaces = helper.find(namespaces, {
			longname: longname
		});
		if (myNamespaces.length)
			generate("Namespace", myNamespaces[0].name, myNamespaces, helper.longnameToUrl[longname]);

		const myMixins = helper.find(mixins, {
			longname: longname
		});
		if (myMixins.length)
			generate("Mixin", myMixins[0].name, myMixins, helper.longnameToUrl[longname]);

		const myExternals = helper.find(externals, {
			longname: longname
		});
		if (myExternals.length)
			generate("External", myExternals[0].name, myExternals, helper.longnameToUrl[longname]);

		const myInterfaces = helper.find(interfaces, {
			longname: longname
		});
		if (myInterfaces.length)
			generate("Interface", myInterfaces[0].name, myInterfaces, helper.longnameToUrl[longname]);
	});

	function generateTutorial(title, tutorial, filename) {
		const tutorialData = {
			children: tutorial.children,
			content: tutorial.parse(),
			header: tutorial.title,
			title
		};

		const tutorialPath = path.join(outdir, filename);
		let html = view.render("tutorial.tmpl", tutorialData);

		html = helper.resolveLinks(html);
		fs.writeFileSync(tutorialPath, html, "utf8");
	}

	function saveChildren(node) {
		node.children.forEach(child => {
			generateTutorial("Tutorial: " + child.title, child, helper.tutorialToUrl(child.name));
			saveChildren(child);
		});
	}

	saveChildren(tutorials);
};
