/*
 * TOML parser
 *
 * Copyright (c) 2017-2023, Longbridge Technologies
 * All rights reserved.
 *
 * Released under the MIT license
 *
 * A minimal TOML parser, focused on speed and correctness.
 * It's not as compliant as others, but it's good enough for most uses.
 */

var TOML = (function() {
  'use strict';

  function parse(str) {
    var i = 0,
        len = str.length,
        obj = {},
        current = obj,
        key,
        value;

    function parseKey() {
      var start = i;
      while (i < len && str[i] !== '=' && str[i] !== ' ' && str[i] !== '	' && str[i] !== '
' && str[i] !== '' && str[i] !== '[') {
        i++;
      }
      return str.substring(start, i);
    }

    function parseString() {
      var start = ++i;
      while (i < len && str[i] !== '"') {
        if (str[i] === '') {
          i++;
        }
        i++;
      }
      var res = str.substring(start, i++);
      // unescape
      return res.replace(/"/g, '"').replace(/	/g, '	').replace(/
/g, '
').replace(//g, '').replace(/\/g, '');
    }

    function parseValue() {
        var c = str[i];
        if (c === '"') {
            return parseString();
        } else if (c === '[') {
            i++;
            var arr = [];
            while (i < len && str[i] !== ']') {
                arr.push(parseValue());
                if (str[i] === ',') {
                    i++;
                }
                while (i < len && (str[i] === ' ' || str[i] === '	')) {
                    i++;
                }
            }
            i++;
            return arr;
        } else {
            var start = i;
            while (i < len && str[i] !== ',' && str[i] !== '
' && str[i] !== '' && str[i] !== ' ' && str[i] !== '	' && str[i] !== ']') {
                i++;
            }
            var val = str.substring(start, i).trim();
            if (val === 'true') {
                return true;
            } else if (val === 'false') {
                return false;
            } else {
                var num = parseFloat(val);
                return isNaN(num) ? val : num;
            }
        }
    }


    function skipWhitespace() {
      while (i < len && (str[i] === ' ' || str[i] === '	' || str[i] === '
' || str[i] === '')) {
        i++;
      }
    }

    function skipComment() {
      if (str[i] === '#') {
        while (i < len && str[i] !== '
' && str[i] !== '') {
          i++;
        }
      }
    }

    while (i < len) {
      skipWhitespace();
      skipComment();
      skipWhitespace();

      if (i >= len) break;

      if (str[i] === '[') {
        i++;
        if (str[i] === '[') {
            i++; // array of tables
            key = parseKey();
            if (!obj[key]) {
                obj[key] = [];
            }
            var new_obj = {};
            obj[key].push(new_obj);
            current = new_obj;

            while (i < len && str[i] !== ']' ) {
              i++;
            }
             if (i<len && str[i] === ']') {
              i++;
              if (i<len && str[i] === ']') {
                i++;
              }
            }


        } else { // table
            key = parseKey();
            if (key.indexOf('.') > 0) {
                var parts = key.split('.');
                var parent = obj;
                for (var j = 0; j < parts.length - 1; j++) {
                    if (!parent[parts[j]]) {
                        parent[parts[j]] = {};
                    }
                    parent = parent[parts[j]];
                }
                key = parts[parts.length - 1];
                current = parent[key] = {};
            } else {
                current = obj[key] = {};
            }
             while (i < len && str[i] !== ']' ) {
              i++;
            }
             if (i<len && str[i] === ']') {
                i++;
             }
        }
      } else {
        key = parseKey();
        skipWhitespace();
        if (str[i] === '=') {
          i++;
          skipWhitespace();
          value = parseValue();
          current[key] = value;
        }
      }
      skipWhitespace();
    }

    return obj;
  }

  return {
    parse: parse
  };
})();
