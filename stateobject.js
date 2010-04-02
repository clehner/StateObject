var stuff = (function () {
	var loaded = false;
	return {
		onLoad: function () {
			loaded = true;
		},
		setLoadCallback: function addLoadCallback(fn, context) {
			stuff.onLoad = function onLoad() {
				loaded = true;
				fn.call(context, stuff.waveState, stuff.waveParticipants); // todo: mode?
			};
			if (loaded) {
				stuff.onLoad();
			}
		}
	};
})();


/**
 * A state object is a key-value map of strings to strings or other state objects.
 * It receives updates from a StateSource object.
 * It fires callbacks when its properties are updated.
 * 
 * @constructor
 */
function StateObject() {
	this._state = {};
}
StateObject.prototype = {
	constructor: StateObject,
	id: "",
	_state /*:object*/: null,
	_keyHandlers /*:object*/: {},
	_keyHandlersContext /*:object*/: null,
	_kvHandler /*:function*/: null,
	_kvHandlerContext /*:object*/: null,
	_source /*:StateSource*/: null,
	_numReferences: 0,
	
	_decReferences: function decReferences() {
		if (!--this._numReferences) {
			this.destroy();
		}
	},
	
	// Prevent it from being garbage collected.
	holdReference: function holdReference() {
		this._numReferences++;
		var self = this;
		return function () {
			self._decReferences();
		};
	},

	destroy: function destroy() {
		// Dispose of this object by deleting every property
		for (var key in this._state) {
			this.set(key, null);
		}
		// It will have to be re-managed if it is used again.
		delete this._source;
	},
	
	// receive an update from the source
	_receiveValue: function receiveValue(key /*:string*/, value /*:string|StateObject|null*/, local) {
		var state = this._state;
		var prevValue = state[key];
		if (value == prevValue) {
			// just for debugging
			console.log("Received a false update!");
			//debugger;
			return;
		}
		if (value == null) {
			delete state[key];
		} else {
			state[key] = value;
		}
		// execute handlers for this key
		if (!local) {
			if (key in this._keyHandlers) {
				this._keyHandlers[key].call(this._keyHandlersContext, value, prevValue);
			}
			if (this._kvHandler) {
				this._kvHandler.call(this._kvHandlerContext, key, value, prevValue);
			}
		}
	},
	set: function set(key /*:string*/, value /*:string|StateObject|null*/, dontRender) {
		var prevValue = this._state[key];
		if (prevValue != value) {
			var source = this._source;
			var buffer = source && !source.buffering && source.startBuffer();
			// render the change locally first.
			this._receiveValue(key, value, !dontRender);
			// reference counting, for garbage collection
			if (value instanceof StateObject) {
				value._numReferences++;
			}
			if (prevValue instanceof StateObject) {
				prevValue._decReferences();
			}
			// now send out the change.
			if (source) {
				source._setValue(this.id, key, value);
				if (buffer) {
					source.endBuffer();
				}
			}
		}
	},
	// Using get() should be avoided when possible, in favor of using the callbacks.
	get: function get(key /*:string*/) {
		return this._state[key];
	},
	setKeyHandlers: function setKeyHandlers(handlers /*:object*/, context /*:object*/) {
		this._keyHandlers = handlers;
		this._keyHandlersContext = context;
		for (var key in handlers) {
			if (key in this._state) {
				handlers[key].call(context, this._state[key]);
			}
		}
	},
	setKeyValueHandler: function setKeyValueHandler(handler /*:function*/, context /*:object*/) {
		this._kvHandler = handler;
		this._kvHandlerContext = context;
		for (var key in this._state) {
			handler.call(context, key, this._state[key]);
		}
	}
	// Make this object point to a different state object
	/*attach: function attach(stateObject / *:StateObject* /) {
		var delta = stateObject._state;
		for (var key in this._state) {
			if (!(key in delta[key])) {
				delta[key] = null;
			}
		}
		this.id = stateObject.id;
		this._source = stateObject._source;
		this._receiveDelta(delta);
	}*/
};

/**
 * A state source connects state objects to something external.
 * Usually that is the Wave Gadgets API, but it could be other things,
 * like DOM Storage.
 * 
 * @constructor
 * @extends StateObject
 */
function StateSource() {
	this._objects = {"": this};
	this._source = this;
	this._flatState = {};
	StateObject.call(this);
}
StateSource.prototype = (function () {
	this.constructor = StateSource;
	this.buffering = false;
	this._buffer = null;
	this._throttle = null; // null for instant, or number (ms)
	
	var KEY_DELIMITER = ".";
	var ID_LENGTH = 5; // 61^5 = 844596301 permutations
	var REFERENCE_MARKER = "#";
	var PARTICIPANT_MARKER = "p";
	var STRING_MARKER = " ";
	
	// returns true if a buffer was created that will need to be ended.
	this.startBuffer = function startBuffer() {
		// nested buffering doesn't do anything.
		if (!this.buffering) {
			this.buffering = true;
			this._buffer = {};
			if (this._throttle == null) {
				return true;
			}
			var self = this;
			setTimeout(function () {
				self.endBuffer();
			}, this._throttle);
		}
		return false;
	};
	
	this.endBuffer = function endBuffer() {
		if (this.buffering) {
			// submit the buffered delta
			this._setFlatDelta(this._buffer);
			this.buffering = false;
			// get rid of buffer
			delete this._buffer;
		}
	};
	
	/**
	 * Throttling is a way to automatically combine state updates within a close time period,
	 * so they go out as one delta. This makes things faster.
	 * @param {?number} delay In milliseconds, or null to turn off throttling (default).
	 */

	this.setThrottle = function setThrottle(delay) {
		this._throttle = delay;
	};
	
	// Random strings are used for ids to minimize collisions.
	var chars = "0123456789abcdefghiklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXTZ",
	numChars = chars.length;
	function randomString(n /*number*/) {
		var str = "";
		while (n-- > 0) {
			str += chars[Math.random() * numChars >> 0];
		}
		return str;
	}
	
	this.manageObject = function manageObject(object /*:StateObject*/) {
		var id = object.id;
		if (!id && this != object) {
			// The source must have an empty id.
			id = object.id = randomString(ID_LENGTH);
		}
		object._source = this;
		this._objects[id] = object;
		// add children
		var state = object._state;
		for (var key in state) {
			this._setValue(id, key, state[key]);
		}
	};
	
	this._setValue = function setValue(objectId /*:string*/, key /*:string*/, value /*:string|null|StateObject*/) {
		var key2 = objectId + KEY_DELIMITER + key;
		var value2;
		if (value instanceof StateObject) {
			// claim unmanaged state objects
			if (!value._source) {
				this.manageObject(value);
			}
			var marker;
			if (value._source == this) {
				marker = REFERENCE_MARKER;
			} else if (value._source == stuff.waveParticipants) {
				marker = PARTICIPANT_MARKER;
			}
			value2 = marker + value.id;
		} else if (value != null) {
			value2 = STRING_MARKER + value;
		}
		this._flatState[key2] = value2;
		if (this.buffering) {
			this._buffer[key2] = value2;
		} else {
			this._setFlatValue(key2, value2);
		}
	};
	
	// Subclasses must override either _setFlatValue or _setFlatDelta,
	// because they call eachother.
	
	this._setFlatValue = function setFlatValue(key /*:string*/, value /*:string*/) {
		var delta = {};
		delta[key] = value;
		this._setFlatDelta(delta);
	};
	
	this._setFlatDelta = function (delta /*:object*/) {
		for (var key in delta) {
			this._setFlatValue(key, delta[key]);
		}
	};
	
	this._getObject = function getObject(id) {
		var object = this._objects[id];
		if (!object) {
			object = new StateObject();
			object.id = id;
			this._objects[id] = object;
			object._source = this;
		}
		return object;
	};
	
	// distribute a flat state update to state objects
	this._receiveFlatValue = function receiveFlatValue(key2 /*:string*/, value2 /*:string*/) {
		// Extract the object and the key from key2.
		// key2 is in the form (objectId + KEY_DELIMITER + key)
		var object, key;
		if (key2[0] == KEY_DELIMITER) {
			// it's a global value (a property of the source)
			object = this;
			key = key2.substr(1);
		} else {
			var i = (key2[ID_LENGTH] == KEY_DELIMITER) ?
				ID_LENGTH : key2.indexOf(KEY_DELIMITER);
			var id = key2.substr(0, i);
			key = key2.substr(1 + i);
			object = this._objects[id] || this._getObject(id);
		}
		
		// Unserialize the value from value2.
		// The first character of value2 determines the type.
		// It can be a string, a reference to another wave state object,
		// or a wave participant state object.
		// The rest of value2 is the actual value or reference.
		// It also could be null if it is being deleted.
		
		var value;
		if (value2 == null) {
			value = null;
		} else {
			value = value2.substr(1);
			switch(value2[0]) {
			case " ":
			break;
			case REFERENCE_MARKER:
				value = this._objects[value] || this._getObject(value);
			break;
			case PARTICIPANT_MARKER:
				value = stuff.waveParticipants._objects[value]; //|| waveParticipants._owesObject(stateObject, key, value);
			/*case JSON_MARKER:
				value = JSON.parse(value);
			break;*/
			}
		}
		
		// notify the object of the update
		object._receiveValue(key, value);
		this._flatState[key2] = value2;
	};
	return this;
}).call(new StateObject());

stuff.waveState =
/**
 * A state source for the wave gadget state.
 * @this {StateSource}
 */
(function () {
	var isReady = this.isReady = false;
	
	this._setFlatDelta = wave.State.prototype.submitDelta;

	this._onStateUpdate = function onStateUpdate(state /*:wave.State*/) {
		var newState = state.state_;
		var prevState = this._flatState;
		var key;
		
		if (!isReady) {
			isReady = this.isReady = true;
			if (stuff.waveParticipants.isReady) {
				stuff.onLoad();
			}
		}
		
		// get deleted keys
		for (key in prevState) {
			if (!(key in newState || prevState[key] == null)) {
				this._receiveFlatValue(key, null);
			}
		}
		
		// get changed keys
		for (key in newState) {
			if (newState[key] !== prevState[key]) {
				this._receiveFlatValue(key, newState[key]);
			}
		}
	};
	return this;
}).call(new StateSource());

stuff.waveParticipants =
/**
 * A state source for the wave participants.
 * @this {StateSource}
 */
(function () {
	var isReady = this.isReady = false;
	var participantStates = this._state;
	var participants = {}; //wave.Participant
	
	// properties of wave.Participants mapped to state object properties
	var properties = {
		"id_": "id",
		"displayName_": "displayName",
		"thumbnailUrl_": "thumbnailUrl"
	};
	
	this._setFlatDelta = function setFlatValue() {
		throw new TypeError("Participants are read only.");
	};
	
	this._onParticipantsChange = function onParticipantsChange() {
		var newParticipants = wave.participantMap_;
		
		if (!isReady) {
			isReady = this.isReady = true;
			if (stuff.waveState.isReady) {
				stuff.onLoad();
			}
		}
		
		for (var id in newParticipants) {
			var newParticipant = newParticipants[id];
			var oldParticipant = participants[id];
			var participantState;
			var prop;
			
			// check if the participant is new
			if (!oldParticipant) {
				participantState = this._getObject(id);
				// get all its properties
				for (prop in properties) {
					participantState._receiveValue(properties[prop], newParticipant[prop]);
				}
				this._receiveValue(id, participantState);
				continue;
			}
			
			// check for changed properties
			participantState = participantStates[id];
			for (prop in properties) {
				if (newParticipant[prop] != oldParticipant[prop]) {
					// property changed
					participantState._receiveValue(properties[prop], newParticipant[prop]);
				}
			}
		}
		participants = newParticipants;
	};
	return this;
}).call(new StateSource());

// Set up Wave callbacks
window.gadgets && gadgets.util.registerOnLoadHandler(function onLoad() {
	if (window.wave && wave.isInWaveContainer()) {
		wave.setParticipantCallback(stuff.waveParticipants._onParticipantsChange, stuff.waveParticipants);
		wave.setStateCallback(stuff.waveState._onStateUpdate, stuff.waveState);
	}
});

window["StateObject"] = StateObject;
window["StateSource"] = StateSource;
window["stuff"] = stuff;
