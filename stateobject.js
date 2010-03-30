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
			// Dispose by deleting every property
			for (var key in this._state) {
				this.set(key, null);
			}
		}
	},
	
	_receiveValue: function receiveValue(key /*:string*/, value /*:string|StateObject|null*/) {
		var delta = {};
		delta[key] = value;
		this._receiveDelta(delta);
	},
	
	// receive a delta from the manager
	_receiveDelta: function receiveDelta(delta /*:object*/) {
		var state = this._state;
		for (var key in delta) {
			var value = delta[key];
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
		}
		/*if (this._deltaHandler) {
			this._deltaHandler.call(this._deltaHandlerContext, delta);
		}*/
	},
	set: function set(key /*:string*/, value /*:string|StateObject|null*/) {
		var manager = this._manager;
		var buffer = manager && !manager.buffering && manager.startBuffer();
		var oldValue = this._state[key];
		if (oldValue != value) {
			// do some basic garbage collection
			if (value instanceof StateObject) {
				value._numReferences++;
			}
			if (oldValue instanceof StateObject) {
				oldValue._decReferences();
			}
			// render the change locally (even though it is buffered)
			this._receiveValue(key, value);
			if (manager) {
				manager._setValue(this._id, key, value);
			}
		}
		if (buffer) {
			manager.endBuffer();
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
	/*setDeltaHandler: function setDeltaHandler(handler / *:function* /, context / *:object* /) {
		this._deltaHandler = handler;
		this._deltaHandlerContext = context;
		handler.call(context, this._state);
	},*/
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
	this.startBuffer = function () {
		if (this.buffering) {
			// nested buffering = no effect
			return false;
		}
		
		this.buffering = true;
		var buffer = this._buffer = {};
		function _setFlatValue(key, value) {
			buffer[key] = value;
		}
		_setFlatValue.original = this._setFlatValue;
		this._setFlatValue = _setFlatValue;
		return true;
	};
	
	this.endBuffer = function () {
		if (this.buffering) {
			this.buffering = false;
			// restore setFlatValue function
			this._setFlatValue = this._setFlatValue.original;
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
		var state = object._state;
		for (var key in state) {
			this._setValue(id, key, state[key]);
		}
	}
	
	this._setValue = function setValue(objectId /*:string*/, key /*:string*/, value /*:string|null|StateObject*/) {
		var key2 = objectId + KEY_DELIMITER + key;
		var value2;
		if (value instanceof StateObject) {
			if (!value._manager) {
				// claim unmanaged state objects
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
		this._setFlatValue(key2, value2);
	};
	
	// do not override
	this._setFlatValue = function setFlatValue(key /*:string*/, value /*:string*/) {
		var delta = {};
		delta[key] = value;
		this._setFlatDelta(delta);
	};
	
	// override-able
	this._setFlatDelta = function (delta /*:object*/) {};
	
	// distributes a flat state update to state objects
	this._receiveFlatDelta = function receiveFlatDelta(delta /*object*/) {
		var objectDeltas = {};
		var key, key2, objectId, value, value2;
		// todo: decide whether state should be passed by value or by deltas
		for (key2 in delta) {
			// extract the object and the key
			if (key2[0] == KEY_DELIMITER) {
				// it's a global so it has no id
				objectId = "";
				key = key2.substr(1);
			} else {
				objectId = key2.substr(0, ID_LENGTH);
				if (!(objectId in this._objects)) {
					new StateObject(objectId, this);
				}
				key = key2.substr(1 + ID_LENGTH);
			}
			(objectDeltas[objectId] || (objectDeltas[objectId] = {}))[key] = delta[key2];
		}
		for (objectId in objectDeltas) {
			var objectDelta = objectDeltas[objectId];
			var stateObject = this._objects[objectId];
			for (key in objectDelta) {
				value2 = objectDelta[key];
				// unserialize the values
				value = value2.substr(1);
				// The first character of the value determines its type. It can be a string, or a reference to another state object, or a wave participant.
				switch(value2[0]) {
				case REFERENCE_MARKER:
					value = this._objects[value] || new StateObject(value, this);
					//this._owesObject(stateObject, key, value);
				break;
				case PARTICIPANT_MARKER:
					value = stuff.waveParticipants._objects[value]; //|| waveParticipants._owesObject(stateObject, key, value);
				/*
				case JSON_MARKER:
					value = JSON.parse(value);
				break;
				*/
				}
				objectDelta[key] = value;
			}
			stateObject._receiveDelta(objectDelta);
		}
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
		var delta = {};
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
				delta[key] = null;
			}
		}
		
		// get changed keys
		for (key in newState) {
			if (delta[key] !== newState[key]) {
				delta[key] = newState[key];
			}
		}
		
		this._receiveFlatDelta(delta);
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
		var delta2; // delta of the list of participants
		
		if (!isReady) {
			isReady = this.isReady = true;
			if (stuff.waveState.isReady) {
				stuff.onLoad();
			}
		}
		
		for (var id in newParticipants) {
			var newParticipant = newParticipants[id];
			var oldParticipant = participants[id];
			var delta; // delta on an individual participant
			var prop;
			
			// check if the participant is new
			if (!oldParticipant) {
				var participantState = new StateObject(id, this);
				(delta2 || (delta2 = {}))[id] = participantState;
				delta = {};
				// get all its properties
				for (prop in properties) {
					delta[properties[prop]] = newParticipant[prop];
				}
				participantState._receiveDelta(delta);
				continue;
			}
			
			// check for changed properties
			for (prop in properties) {
				if (newParticipant[prop] != oldParticipant[prop]) {
					// property changed
					(delta || (delta = {}))[properties[prop]] = newParticipant[prop];
				}
			}
			if (delta) {
				// notify the participant's state object that it changed
				participantStates[id]._receiveDelta(delta);
				delete delta;
			}
		}
		if (delta2) {
			// notify the main state object that the participants list changed
			this._receiveDelta(delta2);
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
