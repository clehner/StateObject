/*
My latest attempt at a state library for wave gadgets!
*/

/*jslint forin: true */

var stuff = (function () {
	var loaded = false;
	return {
		onLoad: function () {
			loaded = true;
		},
		setLoadCallback: function addLoadCallback(fn, context) {
			stuff.onLoad = function onLoad() {
				loaded = true;
				fn.call(context, stuff.waveState, stuff.waveParticipants); // todo: mode
			};
			if (loaded) {
				stuff.onLoad();
			}
		}
	};
})();


/**
 * A state object
 * @constructor
 * @param {string=} id 
 * @param {StateManager=} manager
 */
function StateObject(id, manager) {
	this._state = {};
	if (id != null) {
		this._id = id;
		this._manager = manager;
		manager.manageObject(this);
	}
}
StateObject.prototype = {
	constructor: StateObject,
	_id: "",
	_state /*:object*/: null,
	_keyHandlers /*:object*/: {},
	_keyHandlersContext /*:object*/: null,
	_kvHandler /*:function*/: null,
	_kvHandlerContext /*:object*/: null,
	//_deltaHandler /*:function*/: null,
	//_deltaHandlerContext /*:object*/: null,
	_manager /*:StateManager*/: null,
	_numReferences: 0,
	
	_decReferences: function decReferences() {
		if (!--this._numReferences) {
			this.destroy();
		}
	},

	destroy: function destroy() {
		// Dispose of this object by deleting every property
		for (var key in this._state) {
			this.set(key, null);
		}
		// It will have to be re-managed if it is used again.
		delete this._manager;
	},
	
	// receive an update from the manager
	_receiveValue: function receiveValue(key /*:string*/, value /*:string|StateObject|null*/) {
		var state = this._state;
		if (value != state[key]) {
			if (value == null) {
				delete state[key];
			} else {
				state[key] = value;
			}
			// execute handlers for this key
			if (key in this._keyHandlers) {
				this._keyHandlers[key].call(this._keyHandlersContext, value);
			}
			if (this._kvHandler) {
				this._kvHandler.call(this._kvHandlerContext, key, value);
			}
		}
	},
	set: function set(key /*:string*/, value /*:string|StateObject|null*/) {
		var oldValue = this._state[key];
		if (oldValue != value) {
			var manager = this._manager;
			var buffer = manager && !manager.buffering && manager.startBuffer();
			// reference counting, for garbage collection
			if (value instanceof StateObject) {
				value._numReferences++;
			}
			if (oldValue instanceof StateObject) {
				oldValue._decReferences();
			}
			// render the change locally (even if it is buffered)
			this._receiveValue(key, value);
			if (manager) {
				manager._setValue(this._id, key, value);
			}
			if (buffer) {
				manager.endBuffer();
			}
		}
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
	},
	// Make this object point to a different state object
	/*attach: function attach(stateObject / *:StateObject* /) {
		var delta = stateObject._state;
		for (var key in this._state) {
			if (!(key in delta[key])) {
				delta[key] = null;
			}
		}
		this._id = stateObject._id;
		this._manager = stateObject._manager;
		this._receiveDelta(delta);
	}*/
};

/**
 * Manages state objects. Also is a state object.
 * @constructor
 * @extends StateObject
 */
function StateManager() {
	this._objects = {};
	this._flatState = {};
	StateObject.call(this, "", this);
}
StateManager.prototype = (function () {
	this.constructor = StateManager;
	this.buffering = false;
	this._buffer = null;
	
	var KEY_DELIMITER = ".";
	var ID_LENGTH = 5; // 61^5 = 844596301 permutations
	var REFERENCE_MARKER = "&";
	var PARTICIPANT_MARKER = "p";
	var STRING_MARKER = " ";
	
	// returns true if a buffer was created. returns false if there was already a buffer in place.
	this.startBuffer = function startBuffer() {
		if (this.buffering) {
			// nested buffering = no effect
			return false;
		}
		this.buffering = true;
		this._buffer = {};
		return true;
	};
	
	this.endBuffer = function endBuffer() {
		if (this.buffering) {
			this.buffering = false;
			// submit the buffered delta
			this._setFlatDelta(this._buffer);
			// get rid of buffer
			delete this._buffer;
		}
	};
	
	// Random strings are used for ids, to minimize collisions.
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
		var id = object._id;
		if (!id && this != object) {
			// The manager must have an empty id.
			id = object._id = randomString(ID_LENGTH);
		}
		object._manager = this;
		this._objects[id] = object;
		// add children
		var state = object._state;
		for (var key in state) {
			this._setValue(id, key, state[key]);
		}
	}
	
	this._setValue = function setValue(objectId /*:string*/, key /*:string*/, value /*:string|null|StateObject*/) {
		var key2 = objectId + KEY_DELIMITER + key;
		var value2;
		if (value instanceof StateObject) {
			// claim unmanaged state objects
			if (!value._manager) {
				this.manageObject(value);
			}
			if (value._manager == this) {
				marker = REFERENCE_MARKER;
			} else if (value._manager == stuff.waveParticipants) {
				marker = PARTICIPANT_MARKER;
			}
			value2 = marker + value._id;
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
	
	// Subclasses must override either _setFlatValue or _setFlatDelta.
	
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
	
	// distributes a flat state update to state objects
	this._receiveFlatValue = function receiveFlatValue(key2 /*:string*/, value2 /*:string*/) {
		this._flatState[key2] = value2;
		
		// Extract the object and the key.
		// key2 is in the form (objectId + KEY_DELIMITER + key)
		var object, key;
		if (key2[0] == KEY_DELIMITER) {
			// it's a global value (a property of the manager)
			object = this;
			key = key2.substr(1);
		} else {
			var i = (key2[ID_LENGTH] == KEY_DELIMITER) ?
				ID_LENGTH : key2.indexOf(KEY_DELIMITER);
			var id = key2.substr(0, i);
			key = key2.substr(1 + i);
			object = this._objects[id] || new StateObject(id, this);
		}
		
		// Unserialize the value.
		// The first character of value2 determines its type.
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
			case REFERENCE_MARKER:
				value = this._objects[value] || new StateObject(value, this);
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
	};
	return this;
}).call(new StateObject());

stuff.waveState =
/**
 * A state manager for the wave gadget state.
 * @this {StateManager}
 */
(function () {
	var isReady = this.isReady = false;
	
	this._setFlatDelta = wave.State.prototype.submitDelta;

	this._onStateUpdate = function onStateUpdate(state /*:wave.State*/) {
		//this._setFlatValue = state.submitValue;
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
			if (!(key in newState)) {
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
}).call(new StateManager());

stuff.waveParticipants =
/**
 * A state manager for the wave participants.
 * @this {StateManager}
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
				var participantState = new StateObject(id, this);
				// get all its properties
				for (prop in properties) {
					participantState._receiveValue(properties[prop], newParticipant[prop]);
				}
				this._receiveValue(id, participantState);
				continue;
			}
			
			// check for changed properties
			var participantState = participantStates[id];
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
}).call(new StateManager());

// Set up Wave callbacks
window.gadgets && gadgets.util.registerOnLoadHandler(function onLoad() {
	if (window.wave && wave.isInWaveContainer()) {
		wave.setParticipantCallback(stuff.waveParticipants._onParticipantsChange, stuff.waveParticipants);
		wave.setStateCallback(stuff.waveState._onStateUpdate, stuff.waveState);
	}
});

window["StateObject"] = StateObject;
window["StateManager"] = StateManager;
window["stuff"] = stuff;
