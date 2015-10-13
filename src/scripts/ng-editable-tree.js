define('ng-editable-tree', [], function () {
    'use strict';

    /**
     * @url http://jsfiddle.net/EJGHX/
     */
    angular.module('ngEditableTree', ['ngResource'])
        .directive('treeView', function () {

            return {
                restrict: 'A',
                transclude: 'element',
                priority: 1000,
                terminal: true,
                compile: function (tElement, tAttrs, transclude) {

                    var repeatExpr, childExpr, rootExpr, childrenExpr, branchExpr;

                    repeatExpr = tAttrs.treeView.match(/^(.*) in ((?:.*\.)?(.*)) at (.*)$/);
                    childExpr = repeatExpr[1];
                    rootExpr = repeatExpr[2];
                    childrenExpr = repeatExpr[3];
                    branchExpr = repeatExpr[4];

                    return function link(scope, element, attrs) {

                        var rootElement = element[0].parentNode,
                            cache = [];

                        // Reverse lookup object to avoid re-rendering elements
                        function lookup(child) {
                            var i = cache.length;
                            while (i--) {
                                if (cache[i].scope[childExpr] === child) {
                                    return cache.splice(i, 1)[0];
                                }
                            }
                        }

                        scope.$watch(rootExpr, function (root) {

                            var currentCache = [];

                            // Recurse the data structure
                            (function walk(children, parentNode, parentScope, depth) {

                                var i = 0,
                                    n = (children) ? children.length : 0,
                                    last = n - 1,
                                    cursor,
                                    child,
                                    cached,
                                    childScope,
                                    grandchildren;

                                // Iterate the children at the current level
                                for (; i < n; ++i) {

                                    // We will compare the cached element to the element in
                                    // at the destination index. If it does not match, then
                                    // the cached element is being moved into this position.
                                    cursor = parentNode.childNodes[i];

                                    child = children[i];

                                    // See if this child has been previously rendered
                                    // using a reverse lookup by object reference
                                    cached = lookup(child);

                                    // If the parentScope no longer matches, we've moved.
                                    // We'll have to transclude again so that scopes
                                    // and controllers are properly inherited
                                    if (cached && cached.parentScope !== parentScope) {
                                        cache.push(cached);
                                        cached = null;
                                    }

                                    // If it has not, render a new element and prepare its scope
                                    // We also cache a reference to its branch node which will
                                    // be used as the parentNode in the next level of recursion
                                    if (!cached) {
                                        transclude(parentScope.$new(), function (clone, childScope) {

                                            childScope[childExpr] = child;

                                            cached = {
                                                scope: childScope,
                                                parentScope: parentScope,
                                                element: clone[0],
                                                branch: clone.find(branchExpr)[0]
                                            };

                                            // This had to happen during transclusion so inherited
                                            // controllers, among other things, work properly
                                            parentNode.insertBefore(cached.element, cursor);

                                        });
                                    } else if (cached.element !== cursor) {
                                        parentNode.insertBefore(cached.element, cursor);
                                    }

                                    // Lets's set some scope values
                                    childScope = cached.scope;

                                    // Store the current depth on the scope in case you want
                                    // to use it (for good or evil, no judgment).
                                    childScope.$depth = depth;

                                    // Emulate some ng-repeat values
                                    childScope.$index = i;
                                    childScope.$first = (i === 0);
                                    childScope.$last = (i === last);
                                    childScope.$middle = !(childScope.$first || childScope.$last);

                                    // Push the object onto the new cache which will replace
                                    // the old cache at the end of the walk.
                                    currentCache.push(cached);

                                    // If the child has children of its own, recurse 'em.
                                    grandchildren = child[childrenExpr];
                                    if (grandchildren && grandchildren.length) {
                                        walk(grandchildren, cached.branch, childScope, depth + 1);
                                    }
                                }
                            })(root, rootElement, scope, 0);

                            // Cleanup objects which have been removed.
                            // Remove DOM elements and destroy scopes to prevent memory leaks.
                            var i = cache.length;

                            while (i--) {
                                var cached = cache[i];
                                if (cached.scope) {
                                    cached.scope.$destroy();
                                }
                                if (cached.element) {
                                    cached.element.parentNode.removeChild(cached.element);
                                }
                            }

                            // Replace previous cache.
                            cache = currentCache;

                        }, true);
                    };
                }
            };
        })
        .factory('ngNestedResource', ['$resource', '$q', '$rootScope', function ($resource, $q, $rootScope) {
            function ResourceFactory(url, paramDefaults, actions, options) {
                var defaultActions = {
                    update: { method: 'POST' },
                    create: { method: 'PUT', params: { 'insert': true } },
                    move: { method: 'PUT', params: { 'move': true } }
                };
                actions = angular.extend(defaultActions, actions);
                options = angular.extend({
                    'nestedField': 'children'
                }, options);
                var resource = $resource(url, paramDefaults, actions);

                function walk(items, parent) {
                    parent = parent || null;
                    for (var i = 0, max = items.length; i < max; i++) {
                        if (!items[i][options.nestedField]) {
                            items[i][options.nestedField] = [];
                        }
                        if (!(items[i] instanceof resource)) {
                            items[i] = new resource(items[i]);
                        }
                        if (items[i][options.nestedField].length) {
                            walk(items[i][options.nestedField], items[i]);
                        }
                    }
                }
                resource.prototype.$insertItem = function (cb) {
                    cb = cb || angular.noop;
                    var currentItem = this,
                        clone = angular.copy(this); // clone object because angular resource update original data
                    return clone.$create({ 'id': currentItem.id }, function (item) {
                        item[options.nestedField] = [];
                        currentItem.$expanded = true;
                        currentItem[options.nestedField].unshift(item);
                        if (!$rootScope.$$phase) {
                            $rootScope.$apply();
                        }
                        cb(item);
                    });
                };

                resource.prototype.moveArray = function (tree, child, index) {
                    this[options.nestedField] || (this[options.nestedField] = []);
                    function walk(target, child) {
                        var children = target[options.nestedField], i;
                        if (children) {
                            i = children.length;
                            while (i--) {
                                if (children[i] === child) {
                                    return children.splice(i, 1);
                                } else {
                                    walk(children[i], child);
                                }
                            }
                        }
                    }
                    walk(tree, child);

                    this[options.nestedField].splice(index, 0, child);

                    return (index) ? this[options.nestedField][index - 1] : this;
                };
                resource.prototype.$moveItem = function (before, position, cb) {
                    cb = cb || angular.noop;
                    var clone = new resource(this);
                    return clone.$move({ 'id': this.id, 'insert': position == 0, 'before': before.id }, function (item) {
                        cb(item);
                    });
                };
                resource.getTree = function (data, cb) {
                    cb = cb || angular.noop;
                    if (typeof data == 'function') {
                        cb = data;
                        data = {};
                    }
                    var def = $q.defer();
                    resource.get(data, function (result) {
                        walk(result[options.nestedField]);
                        def.resolve(result);
                        cb(result);
                    });
                    return def.promise;
                };

                var findWalk = function (data, iterator, parents) {
                    parents = parents || [];
                    if (angular.isUndefined(data)) {
                        return null;
                    }
                    if (iterator.call(this, data)) {
                        return data;
                    }
                    var res = null;
                    for (var i = 0, max = data[options.nestedField].length; i < max; i++) {
                        res = findWalk(data[options.nestedField][i], iterator, parents);
                        if (res) {
                            parents.push(data[options.nestedField][i]);
                            break;
                        }
                    }
                    return res;
                };
                resource.find = function (data, iterator, parents) {
                    return findWalk(data, iterator, parents);
                };
                return resource;
            }

            return ResourceFactory;
        }]);


});