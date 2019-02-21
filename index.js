var loaderUtils = require("loader-utils");
var path = require('path');
var jsesc = require('jsesc');

module.exports = function (content) {
    this.cacheable && this.cacheable();

    var options = loaderUtils.getOptions(this) || {};
    var ngModule = getAndInterpolateOption.call(this, 'module', 'ng'); // ng is the global angular module that does not need to explicitly required
    var relativeTo = getAndInterpolateOption.call(this, 'relativeTo', ['']);
    var prefix = getAndInterpolateOption.call(this, 'prefix', '');
    var requireAngular = !!options.requireAngular || false;
    var absolute = false;
    var pathSep = options.pathSep || '/';
    var resource = this.resource;
    var pathSepRegex = new RegExp(escapeRegExp(path.sep), 'g');
    var exportAsEs6Default = options.exportAsEs6Default;
    var exportAsDefault = options.exportAsDefault;

    if (typeof relativeTo === 'string') {
        relativeTo = [relativeTo];
    }

    // if a unix path starts with // we treat is as an absolute path e.g. //Users/wearymonkey
    // if we're on windows, then we ignore the / prefix as windows absolute paths are unique anyway e.g. C:\Users\wearymonkey
    relativeTo.forEach(function (_, i) {
        if (relativeTo[i][0] === '/') {
            if (path.sep === '\\') { // we're on windows
                relativeTo[i] = relativeTo[i].substring(1);
            } else if (relativeTo[i][1] === '/') {
                absolute = true;
                relativeTo[i] = relativeTo[i].substring(1);
            }
        }
    })

    // normalise the path separators
    if (path.sep !== pathSep) {
        relativeTo.forEach(function (relativePath, i) {
            relativeTo[i] = relativePath.replace(pathSepRegex, pathSep);
        })
        prefix = prefix.replace(pathSepRegex, pathSep);
        resource = resource.replace(pathSepRegex, pathSep)
    }

    var firstMatchingPath = getRelativePathThatAppearsFirst(resource, relativeTo);
    var relativeToIndex = firstMatchingPath.index;
    var relativeToPath = firstMatchingPath.path;
    if (relativeToIndex === -1 || (absolute && relativeToIndex !== 0)) {
        throw new Error('The path for file doesn\'t contain relativeTo param');
    }

    // a custom join of prefix using the custom path sep
    var filePath = [prefix, resource.slice(relativeToIndex + relativeToPath.length)]
        .filter(Boolean)
        .join(pathSep)
        .replace(new RegExp(escapeRegExp(pathSep) + '+', 'g'), pathSep);
    var html;

    if (content.match(/(?:^module\.exports)|(?:^export\s+default)|(?:^exports.default)/)) {
        var firstQuote = findQuote(content, false);
        var secondQuote = findQuote(content, true);
        html = content.substr(firstQuote, secondQuote - firstQuote + 1);
    } else {
        html = content;
    }

    var exportsString = "module.exports = ";
    if (exportAsDefault) {
        exportsString = "exports.default = ";
    } else if (exportAsEs6Default) {
        exportsString = "export default ";
    }

    return "var path = '"+jsesc(filePath)+"';\n" +
        "var html = " + html + ";\n" +
        (requireAngular ? "var angular = require('angular');\n" : "window.") +
        "angular.module('" + ngModule + "').run(['$templateCache', function(c) { c.put(path, html) }]);\n" +
        exportsString + " path;";

    function getAndInterpolateOption(optionKey, def) {
        var optionToUse = def;
        var customOptions = options[optionKey];
        if (customOptions) {
            if (Array.isArray(customOptions)) {
                optionToUse = customOptions.map(function(customOption) {
                    return loaderUtils.interpolateName(this, customOption, {
                        text: options.context,
                        content: content,
                        regExp: options[optionKey + 'RegExp'] || options['regExp']
                    })
                }.bind(this))
            } else {
                optionToUse = loaderUtils.interpolateName(this, customOptions, {
                    context: options.context,
                    content: content,
                    regExp: options[optionKey + 'RegExp'] || options['regExp']
                })
            }
        }
        return optionToUse;
    }

    function findQuote(content, backwards) {
        var i = backwards ? content.length - 1 : 0;
        while (i >= 0 && i < content.length) {
            if (content[i] === '"' || content[i] === "'") {
                return i;
            }
            i += backwards ? -1 : 1;
        }
        return -1;
    }

    // source: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions#Using_Special_Characters
    function escapeRegExp(string) {
        return string.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, "\\$1");
    }

    function getRelativePathThatAppearsFirst(currentResourcePath, relativePaths) {
        var currentFirst = null;
        for (var i = 0; i < relativePaths.length; i++) {
            var currentRelativePath = relativePaths[i];
            var indexWithinResource = currentResourcePath.indexOf(currentRelativePath);
            if (indexWithinResource > -1) {
                if (
                    currentFirst === null ||
                    indexWithinResource < currentFirst.index
                ) {
                    currentFirst = { path: currentRelativePath, index: indexWithinResource };
                }
            }
        }
        return currentFirst !== null ? currentFirst : { path: '', index: -1 };
    };
};
