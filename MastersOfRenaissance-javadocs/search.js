/*
 * Copyright (c) 2015, 2020, Oracle and/or its affiliates. All rights reserved.
 * DO NOT ALTER OR REMOVE COPYRIGHT NOTICES OR THIS FILE HEADER.
 *
 * This code is free software; you can redistribute it and/or modify it
 * under the terms of the GNU General Public License version 2 only, as
 * published by the Free Software Foundation.  Oracle designates this
 * particular file as subject to the "Classpath" exception as provided
 * by Oracle in the LICENSE file that accompanied this code.
 *
 * This code is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE.  See the GNU General Public License
 * version 2 for more details (a copy is included in the LICENSE file that
 * accompanied this code).
 *
 * You should have received a copy of the GNU General Public License version
 * 2 along with this work; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin St, Fifth Floor, Boston, MA 02110-1301 USA.
 *
 * Please contact Oracle, 500 Oracle Parkway, Redwood Shores, CA 94065 USA
 * or visit www.oracle.com if you need additional information or have any
 * questions.
 */

const noResult = {l: "No results found"};
const loading = {l: "Loading search index..."};
const catModules = "Modules";
const catPackages = "Packages";
const catTypes = "Classes and Interfaces";
const catMembers = "Members";
const catSearchTags = "Search Tags";
const highlight = "<span class=\"result-highlight\">$&</span>";
let searchPattern = "";
let fallbackPattern = "";
const RANKING_THRESHOLD = 2;
const NO_MATCH = 0xffff;
const MIN_RESULTS = 3;
const MAX_RESULTS = 500;
const UNNAMED = "<Unnamed>";

function escapeHtml(str) {
    return str.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getHighlightedText(item, matcher, fallbackMatcher) {
    const escapedItem = escapeHtml(item);
    let highlighted = escapedItem.replace(matcher, highlight);
    if (highlighted === escapedItem) {
        highlighted = escapedItem.replace(fallbackMatcher, highlight)
    }
    return highlighted;
}

let ui;
ui.item.m = undefined;

function getURLPrefix(thisUI) {
    let urlPrefix = "";
    const slash = "/";
    if (thisUI.item.category === catModules) {
        return thisUI.item.l + slash;
    } else if (thisUI.item.category === catPackages && thisUI.item.m) {
        return thisUI.item.m + slash;
    } else if (thisUI.item.category === catTypes || thisUI.item.category === catMembers) {
        if (thisUI.item.m) {
            urlPrefix = thisUI.item.m + slash;
        } else {
            $.each(packageSearchIndex, function (index, item) {
                if (item.m && thisUI.item.p === item.l) {
                    urlPrefix = item.m + slash;
                }
            });
        }
    }
    return urlPrefix;
}

function createSearchPattern(term) {
    let pattern = "";
    let isWordToken = false;
    term.replace(/,\s*/g, ", ").trim().split(/\s+/).forEach(function (w, index) {
        if (index > 0) {
            // whitespace between identifiers is significant
            pattern += (isWordToken && /^\w/.test(w)) ? "\\s+" : "\\s*";
        }
        const tokens = w.split(/(?=[A-Z,.()<>[\/])/);
        for (const s of tokens) {
            if (s === "") {
                continue;
            }
            pattern += $.ui.autocomplete.escapeRegex(s);
            isWordToken = /\w$/.test(s);
            if (isWordToken) {
                pattern += "([a-z0-9_$<>\\[\\]]*?)";
            }
        }
    });
    return pattern;
}

function createMatcher(pattern, flags) {
    const isCamelCase = /[A-Z]/.test(pattern);
    return new RegExp(pattern, flags + (isCamelCase ? "" : "i"));
}

const watermark = 'Search';
$(function () {
    const search = $("#search");
    const reset = $("#reset");
    search.val('');
    search.prop("disabled", false);
    reset.prop("disabled", false);
    search.val(watermark).addClass('watermark');
    search.blur(function () {
        if ($(this).val().length === 0) {
            $(this).val(watermark).addClass('watermark');
        }
    });
    search.on('click keydown paste', function () {
        if ($(this).val() === watermark) {
            $(this).val('').removeClass('watermark');
        }
    });
    reset.click(function () {
        search.val('').focus();
    });
    search.focus()[0].setSelectionRange(0, 0);
});
$.widget("custom.catcomplete", $.ui.autocomplete, {
    _create: function () {
        this._super();
        this.widget().menu("option", "items", "> :not(.ui-autocomplete-category)");
    },
    _renderMenu: function (ul, items) {
        const rMenu = this;
        let currentCategory = "";
        rMenu.menu.bindings = $();
        $.each(items, function (index, item) {
            let li;
            if (item.category && item.category !== currentCategory) {
                ul.append("<li class=\"ui-autocomplete-category\">" + item.category + "</li>");
                currentCategory = item.category;
            }
            li = rMenu._renderItemData(ul, item);
            if (item.category) {
                li.attr("aria-label", item.category + " : " + item.l);
                li.attr("class", "result-item");
            } else {
                li.attr("aria-label", item.l);
                li.attr("class", "result-item");
            }
        });
    },
    _renderItem: function (ul, item) {
        let label;
        const matcher = createMatcher(escapeHtml(searchPattern), "g");
        const fallbackMatcher = new RegExp(fallbackPattern, "gi");
        if (item.category === catModules) {
            label = getHighlightedText(item.l, matcher, fallbackMatcher);
        } else if (item.category === catPackages) {
            label = getHighlightedText(item.l, matcher, fallbackMatcher);
        } else if (item.category === catTypes) {
            label = (item.p && item.p !== UNNAMED)
                ? getHighlightedText(item.p + "." + item.l, matcher, fallbackMatcher)
                : getHighlightedText(item.l, matcher, fallbackMatcher);
        } else if (item.category === catMembers) {
            label = (item.p && item.p !== UNNAMED)
                ? getHighlightedText(item.p + "." + item.c + "." + item.l, matcher, fallbackMatcher)
                : getHighlightedText(item.c + "." + item.l, matcher, fallbackMatcher);
        } else if (item.category === catSearchTags) {
            label = getHighlightedText(item.l, matcher, fallbackMatcher);
        } else {
            label = item.l;
        }
        const li = $("<li/>").appendTo(ul);
        const div = $("<div/>").appendTo(li);
        if (item.category === catSearchTags && item.h) {
            if (item.d) {
                div.html(label + "<span class=\"search-tag-holder-result\"> (" + item.h + ")</span><br><span class=\"search-tag-desc-result\">"
                    + item.d + "</span><br>");
            } else {
                div.html(label + "<span class=\"search-tag-holder-result\"> (" + item.h + ")</span>");
            }
        } else {
            if (item.m) {
                div.html(item.m + "/" + label);
            } else {
                div.html(label);
            }
        }
        return li;
    }
});

function rankMatch(match, category) {
    if (!match) {
        return NO_MATCH;
    }
    const index = match.index;
    const input = match.input;
    let leftBoundaryMatch = 2;
    let periferalMatch = 0;
    // make sure match is anchored on a left word boundary
    if (index === 0 || /\W/.test(input[index - 1]) || "_" === input[index]) {
        leftBoundaryMatch = 0;
    } else if ("_" === input[index - 1] || (input[index] === input[index].toUpperCase() && !/^[A-Z0-9_$]+$/.test(input))) {
        leftBoundaryMatch = 1;
    }
    const matchEnd = index + match[0].length;
    const leftParen = input.indexOf("(");
    const endOfName = leftParen > -1 ? leftParen : input.length;
    // exclude peripheral matches
    if (category !== catModules && category !== catSearchTags) {
        const delim = category === catPackages ? "/" : ".";
        if (leftParen > -1 && leftParen < index) {
            periferalMatch += 2;
        } else if (input.lastIndexOf(delim, endOfName) >= matchEnd) {
            periferalMatch += 2;
        }
    }
    let delta = match[0].length === endOfName ? 0 : 1; // rank full match higher than partial match
    for (let i = 1; i < match.length; i++) {
        // lower ranking if parts of the name are missing
        if (match[i])
            delta += match[i].length;
    }
    if (category === catTypes) {
        // lower ranking if a type name contains unmatched camel-case parts
        if (/[A-Z]/.test(input.substring(matchEnd)))
            delta += 5;
        if (/[A-Z]/.test(input.substring(0, index)))
            delta += 5;
    }
    return leftBoundaryMatch + periferalMatch + (delta / 200);

}

function doSearch(request, response) {
    let updateSearchResults;
    let result = [];
    searchPattern = createSearchPattern(request.term);
    fallbackPattern = createSearchPattern(request.term.toLowerCase());
    if (searchPattern === "") {
        return this.close();
    }
    const camelCaseMatcher = createMatcher(searchPattern, "");
    const fallbackMatcher = new RegExp(fallbackPattern, "i");

    function searchIndexWithMatcher(indexArray, matcher, category, nameFunc) {
        if (indexArray) {
            const newResults = [];
            $.each(indexArray, function (i, item) {
                item.category = category;
                const ranking = rankMatch(matcher.exec(nameFunc(item)), category);
                if (ranking < RANKING_THRESHOLD) {
                    newResults.push({ranking: ranking, item: item});
                }
                return newResults.length <= MAX_RESULTS;
            });
            return newResults.sort(function (e1, e2) {
                return e1.ranking - e2.ranking;
            }).map(function (e) {
                return e.item;
            });
        }
        return [];
    }

    function searchIndex(indexArray, category, nameFunc) {
        const primaryResults = searchIndexWithMatcher(indexArray, camelCaseMatcher, category, nameFunc);
        result = result.concat(primaryResults);
        if (primaryResults.length <= MIN_RESULTS && camelCaseMatcher.flags.indexOf("i") === -1) {
            const secondaryResults = searchIndexWithMatcher(indexArray, fallbackMatcher, category, nameFunc);
            result = result.concat(secondaryResults.filter(function (item) {
                return primaryResults.indexOf(item) === -1;
            }));
        }
    }

    searchIndex(moduleSearchIndex, catModules, function (item) {
        return item.l;
    });
    searchIndex(packageSearchIndex, catPackages, function (item) {
        return (item.m && request.term.indexOf("/") > -1)
            ? (item.m + "/" + item.l) : item.l;
    });
    searchIndex(typeSearchIndex, catTypes, function (item) {
        return request.term.indexOf(".") > -1 ? item.p + "." + item.l : item.l;
    });
    searchIndex(memberSearchIndex, catMembers, function (item) {
        return request.term.indexOf(".") > -1
            ? item.p + "." + item.c + "." + item.l : item.l;
    });
    searchIndex(tagSearchIndex, catSearchTags, function (item) {
        return item.l;
    });

    if (!indexFilesLoaded()) {
        updateSearchResults = function () {
            doSearch(request, response);
        };
        result.unshift(loading);
    } else {
        updateSearchResults = function () {
        };
    }
    response(result);
}

parent.classFrame = undefined;
$(function () {
    $("#search").catcomplete({
        minLength: 1,
        delay: 300,
        source: doSearch,
        response: function (event, thisUI) {
            if (!thisUI.content.length) {
                thisUI.content.push(noResult);
            } else {
                $("#search").empty();
            }
        },
        autoFocus: true,
        focus: function (event, thisUI) {
            return false;
        },
        position: {
            collision: "flip"
        },
        select: function (event, thisUI) {
            if (thisUI.item.category) {
                let url = getURLPrefix(thisUI);
                if (thisUI.item.category === catModules) {
                    url += "module-summary.html";
                } else if (thisUI.item.category === catPackages) {
                    if (thisUI.item.u) {
                        url = thisUI.item.u;
                    } else {
                        url += thisUI.item.l.replace(/\./g, '/') + "/package-summary.html";
                    }
                } else if (thisUI.item.category === catTypes) {
                    if (thisUI.item.u) {
                        url = thisUI.item.u;
                    } else if (thisUI.item.p === UNNAMED) {
                        url += thisUI.item.l + ".html";
                    } else {
                        url += thisUI.item.p.replace(/\./g, '/') + "/" + thisUI.item.l + ".html";
                    }
                } else if (thisUI.item.category === catMembers) {
                    if (thisUI.item.p === UNNAMED) {
                        url += thisUI.item.c + ".html" + "#";
                    } else {
                        url += thisUI.item.p.replace(/\./g, '/') + "/" + thisUI.item.c + ".html" + "#";
                    }
                    if (thisUI.item.u) {
                        url += thisUI.item.u;
                    } else {
                        url += thisUI.item.l;
                    }
                } else if (thisUI.item.category === catSearchTags) {
                    url += thisUI.item.u;
                }
                if (top !== window) {
                    parent.classFrame.location = pathtoroot + url;
                } else {
                    window.location.href = pathtoroot + url;
                }
                $("#search").focus();
            }
        }
    });
});
