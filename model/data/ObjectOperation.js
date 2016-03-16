'use strict';

var isString = require('lodash/isString');
var isEqual = require('lodash/isEqual');
var cloneDeep = require('lodash/cloneDeep');
var DataObject = require('./DataObject');
var Operation = require('./Operation');
var TextOperation = require('./TextOperation');
var ArrayOperation = require('./ArrayOperation');
var Conflict = require('./Conflict');

var NOP = "NOP";
var CREATE = "create";
var DELETE = 'delete';
var UPDATE = 'update';
var SET = 'set';

/*
  @class
  @extends Operation
*/
var ObjectOperation = function(data) {
  Operation.call(this);
  if (!data) {
    throw new Error('Data of ObjectOperation is missing.');
  }
  if (!data.type) {
    throw new Error('Invalid data: type is mandatory.');
  }
  this.type = data.type;
  if (data.type === NOP) {
    return;
  }
  this.path = data.path;
  if (!data.path) {
    throw new Error('Invalid data: path is mandatory.');
  }
  if (this.type === CREATE || this.type === DELETE) {
    if (!data.val) {
      throw new Error('Invalid data: value is missing.');
    }
    this.val = data.val;
  }
  else if (this.type === UPDATE) {
    if (data.diff) {
      this.diff = data.diff;
      if (data.diff._isTextOperation) {
        this.propertyType = 'string';
      } else if (data.diff._isArrayOperation) {
        this.propertyType = 'array';
      } else {
        throw new Error('Invalid data: diff must be a TextOperation or an ArrayOperation.');
      }
    } else {
      throw new Error("Invalid data: diff is mandatory for update operation.");
    }
  }
  else if (this.type === SET) {
    this.val = data.val;
    this.original = data.original;
  } else {
    throw new Error('Invalid type: '+ data.type);
  }
};

ObjectOperation.fromJSON = function(data) {
  data = cloneDeep(data);
  if (data.type === "update") {
    switch (data.propertyType) {
    case "string":
      data.diff = TextOperation.fromJSON(data.diff);
      break;
    case "array":
      data.diff = ArrayOperation.fromJSON(data.diff);
      break;
    default:
      throw new Error("Unsupported update diff:" + JSON.stringify(data.diff));
    }
  }
  var op = new ObjectOperation(data);
  return op;
};

ObjectOperation.Prototype = function() {

  this._isObjectOperation = true;

  this.apply = function(obj) {
    if (this.type === NOP) return obj;
    var adapter;
    if (obj._isDataObject) {
      adapter = obj;
    } else {
      adapter = new DataObject(obj);
    }
    if (this.type === CREATE) {
      adapter.set(this.path, cloneDeep(this.val));
      return obj;
    }
    if (this.type === DELETE) {
      adapter.delete(this.path, "strict");
    }
    else if (this.type === UPDATE) {
      var diff = this.diff;
      var oldVal = adapter.get(this.path);
      var newVal;
      if (diff._isArrayOperation) {
        newVal = diff.apply(oldVal);
      } else {
        newVal = diff.apply(oldVal);
      }
      adapter.set(this.path, newVal);
    }
    else /* if (this.type === SET) */ {
      // clone here as the operations value must not be changed
      adapter.set(this.path, cloneDeep(this.val));
    }
    return obj;
  };

  this.clone = function() {
    var data = {
      type: this.type,
      path: this.path,
    };
    if (this.val) {
      data.val = cloneDeep(this.val);
    }
    if (this.diff) {
      data.diff = this.diff.clone();
    }
    return new ObjectOperation(data);
  };

  this.isNOP = function() {
    if (this.type === NOP) return true;
    else if (this.type === UPDATE) return this.diff.isNOP();
  };

  this.isCreate = function() {
    return this.type === CREATE;
  };

  this.isDelete = function() {
    return this.type === DELETE;
  };

  this.isUpdate = function(propertyType) {
    if (propertyType) {
      return (this.type === UPDATE && this.propertyType === propertyType);
    } else {
      return this.type === UPDATE;
    }
  };

  this.isSet = function() {
    return this.type === SET;
  };

  this.invert = function() {
    if (this.type === NOP) {
      return new ObjectOperation({ type: NOP });
    }
    var result = new ObjectOperation(this);
    if (this.type === CREATE) {
      result.type = DELETE;
    }
    else if (this.type === DELETE) {
      result.type = CREATE;
    }
    else if (this.type === UPDATE) {
      var invertedDiff;
      if (this.diff._isTextOperation) {
        invertedDiff = TextOperation.fromJSON(this.diff.toJSON()).invert();
      } else {
        invertedDiff = ArrayOperation.fromJSON(this.diff.toJSON()).invert();
      }
      result.diff = invertedDiff;
    }
    else /* if (this.type === SET) */ {
      result.val = this.original;
      result.original = this.val;
    }
    return result;
  };

  this.hasConflict = function(other) {
    return ObjectOperation.hasConflict(this, other);
  };

  this.toJSON = function() {
    if (this.type === NOP) {
      return { type: NOP };
    }
    var data = {
      type: this.type,
      path: this.path,
    };
    if (this.type === CREATE || this.type === DELETE) {
      data.val = this.val;
    }
    else if (this.type === UPDATE) {
      if (this.diff._isArrayOperation) {
        data.propertyType = "array";
      } else /* if (this.diff._isTextOperation) */ {
        data.propertyType = "string";
      }
      data.diff = this.diff.toJSON();
    }
    else /* if (this.type === SET) */ {
      data.val = this.val;
      data.original = this.original;
    }
    return data;
  };

  this.getType = function() {
    return this.type;
  };

  this.getPath = function() {
    return this.path;
  };

  this.getValue = function() {
    return this.val;
  };

  this.getOldValue = function() {
    return this.original;
  };

  this.getValueOp = function() {
    return this.diff;
  };

  this.toString = function() {
    switch (this.type) {
      case CREATE:
        return ["(+,", JSON.stringify(this.path), JSON.stringify(this.val), ")"].join('');
      case DELETE:
        return ["(-,", JSON.stringify(this.path), JSON.stringify(this.val), ")"].join('');
      case UPDATE:
        return ["(>>,", JSON.stringify(this.path), this.propertyType, this.diff.toString(), ")"].join('');
      case SET:
        return ["(=,", JSON.stringify(this.path), this.val, this.original, ")"].join('');
    }
  };
};

Operation.extend(ObjectOperation);

/* Low level implementation */

var hasConflict = function(a, b) {
  if (a.type === NOP || b.type === NOP) return false;
  return isEqual(a.path, b.path);
};

var transform_delete_delete = function(a, b) {
  // both operations have the same effect.
  // the transformed operations are turned into NOPs
  a.type = NOP;
  b.type = NOP;
};

var transform_create_create = function() {
  throw new Error("Can not transform two concurring creates of the same property");
};

var transform_delete_create = function() {
  throw new Error('Illegal state: can not create and delete a value at the same time.');
};

var transform_delete_update = function(a, b, flipped) {
  if (a.type !== DELETE) {
    return transform_delete_update(b, a, true);
  }
  var op;
  if (b.propertyType === 'string') {
    op = TextOperation.fromJSON(b.diff);
  } else /* if (b.propertyType === 'array') */ {
    op = ArrayOperation.fromJSON(b.diff);
  }
  // (DELETE, UPDATE) is transformed into (DELETE, CREATE)
  if (!flipped) {
    a.type = NOP;
    b.type = CREATE;
    b.val = op.apply(a.val);
  }
  // (UPDATE, DELETE): the delete is updated to delete the updated value
  else {
    a.val = op.apply(a.val);
    b.type = NOP;
  }
};

var transform_create_update = function() {
  // it is not possible to reasonably transform this.
  throw new Error("Can not transform a concurring create and update of the same property");
};

var transform_update_update = function(a, b) {
  // Note: this is a conflict the user should know about
  var op_a, op_b, t;
  if (b.propertyType === 'string') {
    op_a = TextOperation.fromJSON(a.diff);
    op_b = TextOperation.fromJSON(b.diff);
    t = TextOperation.transform(op_a, op_b, {inplace: true});
  } else /* if (b.propertyType === 'array') */ {
    op_a = ArrayOperation.fromJSON(a.diff);
    op_b = ArrayOperation.fromJSON(b.diff);
    t = ArrayOperation.transform(op_a, op_b, {inplace: true});
  }
  a.diff = t[0];
  b.diff = t[1];
};

var transform_create_set = function() {
  throw new Error('Illegal state: can not create and set a value at the same time.');
};

var transform_delete_set = function(a, b, flipped) {
  if (a.type !== DELETE) return transform_delete_set(b, a, true);
  if (!flipped) {
    a.type = NOP;
    b.type = CREATE;
    b.original = undefined;
  } else {
    a.val = b.val;
    b.type = NOP;
  }
};

var transform_update_set = function() {
  throw new Error("Unresolvable conflict: update + set.");
};

var transform_set_set = function(a, b) {
  a.type = NOP;
  b.original = a.val;
};

var _NOP = 0;
var _CREATE = 1;
var _DELETE = 2;
var _UPDATE = 4;
var _SET = 8;

var CODE = {};
CODE[NOP] =_NOP;
CODE[CREATE] = _CREATE;
CODE[DELETE] = _DELETE;
CODE[UPDATE] = _UPDATE;
CODE[SET] = _SET;

var __transform__ = [];
__transform__[_DELETE | _DELETE] = transform_delete_delete;
__transform__[_DELETE | _CREATE] = transform_delete_create;
__transform__[_DELETE | _UPDATE] = transform_delete_update;
__transform__[_CREATE | _CREATE] = transform_create_create;
__transform__[_CREATE | _UPDATE] = transform_create_update;
__transform__[_UPDATE | _UPDATE] = transform_update_update;
__transform__[_CREATE | _SET   ] = transform_create_set;
__transform__[_DELETE | _SET   ] = transform_delete_set;
__transform__[_UPDATE | _SET   ] = transform_update_set;
__transform__[_SET    | _SET   ] = transform_set_set;

var transform = function(a, b, options) {
  options = options || {};
  if (options['no-conflict'] && hasConflict(a, b)) {
    throw new Conflict(a, b);
  }
  if (!options.inplace) {
    a = a.clone();
    b = b.clone();
  }
  if (a.isNOP() || b.isNOP()) {
    return [a, b];
  }
  var sameProp = isEqual(a.path, b.path);
  // without conflict: a' = a, b' = b
  if (sameProp) {
    __transform__[CODE[a.type] | CODE[b.type]](a,b);
  }
  return [a, b];
};

ObjectOperation.transform = transform;
ObjectOperation.hasConflict = hasConflict;

/* Factories */

ObjectOperation.Create = function(idOrPath, val) {
  var path;
  if (isString(idOrPath)) {
    path = [idOrPath];
  } else {
    path = idOrPath;
  }
  return new ObjectOperation({type: CREATE, path: path, val: val});
};

ObjectOperation.Delete = function(idOrPath, val) {
  var path;
  if (isString(idOrPath)) {
    path = [idOrPath];
  } else {
    path = idOrPath;
  }
  return new ObjectOperation({type: DELETE, path: path, val: val});
};

ObjectOperation.Update = function(path, op) {
  var propertyType;
  if (op._isTextOperation) {
    propertyType = "string";
  }
  else if (op._isArrayOperation) {
    propertyType = "array";
  }
  else {
    throw new Error('Unsupported type for operational changes');
  }
  return new ObjectOperation({
    type: UPDATE,
    path: path,
    diff: op
  });
};

ObjectOperation.Set = function(path, oldVal, newVal) {
  return new ObjectOperation({
    type: SET,
    path: path,
    val: cloneDeep(newVal),
    original: cloneDeep(oldVal)
  });
};

ObjectOperation.NOP = NOP;
ObjectOperation.CREATE = CREATE;
ObjectOperation.DELETE = DELETE;
ObjectOperation.UPDATE = UPDATE;
ObjectOperation.SET = SET;

module.exports = ObjectOperation;
