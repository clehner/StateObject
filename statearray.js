/**
 * Elastic array thing
 * @constructor
 */
function StateArray(state /*:StateObject*/) {
	this._items = [];
	this._itemsById = {};
	this._state = state;
	state.setKeyValueHandler(this._onStateChange, this);
}
StateArray.prototype = {
	_items: null,
	_state: null,
	_onInsert: null,
	_onInsertContext: null,
	_onRemove: null,
	_onRemoveContext: null,
	removeItem: function removeItem(object /*:StateObject*/) {
		var item = this._itemsById[object.id];
		if (item) {
			var i = this._items.indexOf(item);
			this._items.splice(i, 1);
			this._state.set(item.position, null);
		} else {
			throw new TypeError("Can't remove an item not in the array.");
		}
	},
	insertItem: function insertItem(object /*:StateObject*/, nextSibling /*:StateObject*/) {
		var min, max;
		var items = this._items;
		var nextSibIndex = -1;
		if (nextSibling) {
			var nextSibItem = this._itemsById[nextSibling.id];
			if (!nextSibItem) {
				throw new TypeError("The given sibling is not in the array.");
			}
			max = nextSibItem.position;
			nextSibIndex = items.indexOf(nextSibItem);
			var prevSibItem = items[nextSibIndex - 1];
			min = prevSibItem.position;
		} else {
			if (items.length) {
				var lastItem = items[items.length - 1];
				min = lastItem.position;
			}
		}
		var pos = StateArray._stringBetween(min, max);
		var item = this._itemsById[object.id] = {
			position: pos,
			object: object
		};
		
		this._items.splice(nextSibIndex, 
		this._state.set(pos, object);
	},
	_insertItem: function (object /*:StateObject*/, position /*:string*/ {
	
	},
	setInsertCallback: function (onInsert /*:function(inserted:StateObject, before:StateObject, id:number)*/, context /*:object*/) {
		this._onInsert = onInsert;
		this._onInsertContext = context;
		// if items have already been inserted, notify the callback.
		var n = this._items.length;
		if (n) for (var i = 0; i < n; i++) {
			onInsert.call(context, this._items[i].object, null, i);
		}
	},
	setRemoveCallback: function (onRemove /*:function*/, context /*:object*/) {
		this._onRemove = onRemove;
		this._onRemoveContext = context;
	},
	_onStateChange: function onStateChange(key, value, prevValue) {
		var items = this._items;
		var itemsById = this._itemsById;
		var item;
		if (value instanceof StateObject) {
			// an item was inserted.
			//var pos = keyToPosition(key);
			var newPosition = key;
			var newItem = itemsById[value.id] = {
				position: newPosition,
				object: value,
				key: key
			};
			var i = 0;
			while ((item = items[i])) {
				if (item.position > newPosition) {
					// insert before this item
					break;
				}
				i++;
			}
			items.splice(i, 0, newItem);
			if (this._onInsert) {
				this._onInsert.call(this._onInsertContext, value,
					item ? item.object : null, i);
			}
		} else if (prevValue instanceof StateObject) {
			// an item was removed.
			var id = prevValue.id;
			item = itemsById[id];
			var index = items.indexOf(item);
			delete itemsById[id];
			items.splice(index, 1);
			if (this._onRemove) {
				this._onRemove.call(this._handlersContext, prevValue, index);
			}
		}
	}
};

/**
 * Generate a string randomly between two strings.
 * Prefer ascii 0-127 characters because they are single-byte in utf-8.
 * @param {string=} min Lower-limit string.
 * @param {string=} max Upper-limit string.
 * @param {number=} minCharCode Lowest character code the string should use.
 * @param {number=} maxCharCode Highest character code the string should use.
 * @param {number=} chance Maximum odds of collision tolerated.
 * @return {string} The string generated, between min and 
 */
StateArray._stringBetween = function stringBetween(min, max,
	minCharCode, maxCharCode, chance) {
	maxCharCode = maxCharCode || 127;
	minCharCode = minCharCode || 0;
	chance = chance || 15625;
	if (max) {
		if (min == max) {
			if (window.console) {
				console.log("Strings are equal.");
			}
		}
		if (min > max) {
			/*var tmp = min;
			min = max;
			max = tmp;*/
			throw new Error("Strings out of order.");
		}
	} else {
		max = "";
	}
	min = min || "";
	var chars = [];
	var minLen = min && min.length;
	var maxLen = max && max.length;
	// Copy chars from min and max where they are the same.
	for (var i = 0; (min[i] == max[i]) && (i < minLen); i++) {
		chars[i] = min.charCodeAt(i);
	}
	var ranges = 1;
	var low, high, mid, range;
	// Add characters in range.
	do {
		high = i < maxLen ? max.charCodeAt(i) : maxCharCode;
		low = i < minLen ? min.charCodeAt(i) : minCharCode;
		range = high - low;
		ranges *= (range + 1);
		mid = low + ~~(range * Math.random());
		chars[i++] = mid;
	} while (mid == low);
	// Add random characters.
	range = maxCharCode - minCharCode;
	while (ranges < chance) {
		ranges *= range;
		chars[i++] = minCharCode + ~~(range * Math.random());
	}
	var str = String.fromCharCode.apply(null, chars);
	//if (str >= max || str <= min) debugger;
	return str;
};

/*
String.prototype.codes = function() { return [].map.call(this, function (str) { return str.charCodeAt(0); }); };
Array.prototype.codes = function() { return this.map(function (str) { return str.charCodeAt(0); });};


window["StateArray"] = StateArray;
StateArray.prototype["setInsertCallback"] = StateArray.prototype.setInsertCallback;
StateArray.prototype["setRemoveCallback"] = StateArray.prototype.setRemoveCallback;
StateArray.prototype["insertItem"] = StateArray.prototype.insertItem;
StateArray.prototype["removeItem"] = StateArray.prototype.removeItem;
*/