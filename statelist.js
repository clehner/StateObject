/**
 * Elastic list thing
 * @constructor
 */
function StateList(state /*:StateObject*/) {
	this._items = [];
	this._positions = [];
	this.state = state;
	state.setKeyValueHandler(this._onStateChange, this);
}
StateList.prototype = {
	state: null,
	_items: null,
	_positions: null,
	_onInsert: null,
	_onInsertContext: null,
	_onRemove: null,
	_onRemoveContext: null,
	removeItem: function removeItem(object /*:StateObject*/) {
		// The object to be removed must be in the list.
		var i = this._items.indexOf(object);
		if (i != -1) {
			var pos = this._positions[i];
			this.state.set(pos, null);
		}
	},
	insertItem: function insertItem(object /*:StateObject*/, nextSibling /*:StateObject*/) {
		var min, max, i;
		var items = this._items;
		var positions = this._positions;
		var numItems;
		if (nextSibling) {
			i = items.indexOf(nextSibling);
			if (i == -1) {
				// Sibling is not in the list. So we insert it.
				this.insertItem(nextSibling);
				//console.log("inserted a sibling.");
				//throw new TypeError("The given sibling is not in the list.");
			}
			max = positions[i]; // position of the next sibling
			min = positions[i - 1]; // position of previous sibling
		} else if ((numItems = items.length)) {
			// get pos of last item
			min = positions[numItems - 1];
		}
		var objectIndex = items.indexOf(object);
		if (objectIndex != -1) {
			if (!nextSibling || items.indexOf(nextSibling) == objectIndex + 1) {
				// Object is already in the list.
				return;
			}
		}
		var pos = StateList._stringBetween(min, max);
		this.state.set(pos, object);
	},
	setInsertCallback: function (onInsert /*:function(inserted:StateObject, before:StateObject, id:number)*/, context /*:object*/) {
		this._onInsert = onInsert;
		this._onInsertContext = context;
		// if items have already been inserted, notify the callback.
		var n = this._items.length;
		if (n) for (var i = 0; i < n; i++) {
			onInsert.call(context, this._items[i], null, i);
		}
	},
	setRemoveCallback: function (onRemove /*:function*/, context /*:object*/) {
		this._onRemove = onRemove;
		this._onRemoveContext = context;
	},
	_onStateChange: function onStateChange(pos, value, prevValue) {
		var items = this._items;
		var positions = this._positions;
		var i;
		if (prevValue instanceof StateObject) {
			// An item was removed.
			i = items.indexOf(prevValue);
			items.splice(i, 1);
			positions.splice(i, 1);
			if (this._onRemove) {
				this._onRemove.call(this._onRemoveContext, prevValue, i);
			}
		}
		if (value instanceof StateObject) {
			// An item was inserted.
			// Find the right index at which to insert it.
			for (i = 0; positions[i] < pos; i++);
			// get sibling
			var sibling = items[i];
			// insert it and its position
			items.splice(i, 0, value);
			positions.splice(i, 0, pos);
			// notify listeners
			if (this._onInsert) {
				this._onInsert.call(this._onInsertContext, value, sibling, i);
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
StateList._stringBetween = function stringBetween(min, max,
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
	var highConstrained = true;
	// Add characters in range.
	do {
		high = i < maxLen && highConstrained ? max.charCodeAt(i) : maxCharCode;
		low = i < minLen ? min.charCodeAt(i) : minCharCode;
		range = high - low;
		ranges *= (range + 1);
		mid = low + ~~(range * Math.random());
		chars[i++] = mid;
		if (mid != high) {
			highConstrained = false;
		}
		if (i > 100 || ranges < 0) debugger;
	} while (mid == low);
	// Add random characters.
	range = maxCharCode - minCharCode;
	while (ranges < chance) {
		ranges *= range;
		if (i > 100) debugger;
		chars[i++] = minCharCode + ~~(range * Math.random());
	}
	var str = String.fromCharCode.apply(null, chars);
	//if (str >= max || str <= min) debugger;
	return str;
};

/*
String.prototype.codes = function() { return [].map.call(this, function (str) { return str.charCodeAt(0); }); };
Array.prototype.codes = function() { return this.map(function (str) { return str.charCodeAt(0); });};
*/

window["StateList"] = StateList;
(function (a) {
	a["setInsertCallback"] = a.setInsertCallback;
	a["setRemoveCallback"] = a.setRemoveCallback;
	a["insertItem"] = a.insertItem;
	a["removeItem"] = a.removeItem;
})(StateList.prototype);