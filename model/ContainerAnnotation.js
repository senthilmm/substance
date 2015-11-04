'use strict';

var _ = require('../util/helpers');
var oo = require('../util/oo');
var EventEmitter = require('../util/EventEmitter');
var Node = require('./DocumentNode');
var Selection = require('./Selection');

// Container Annotation
// ----------------
//
// Describes an annotation sticking on a container that can span over multiple
// nodes.
//
// Here's an example:
//
// {
//   "id": "subject_reference_1",
//   "type": "subject_reference",
//   "container": "content",
//   "startPath": ["text_2", "content"],
//   "startOffset": 100,
//   "endPath": ["text_4", "content"],
//   "endOffset": 40
// }


var ContainerAnnotation = Node.extend({
  displayName: "ContainerAnnotation",
  name: "container-annotation",

  properties: {
    // id of container node
    container: 'string',
    startPath: ['array', 'string'],
    startOffset: 'number',
    endPath: ['array', 'string'],
    endOffset: 'number'
  },

  getStartAnchor: function() {
    if (!this._startAnchor) {
      this._startAnchor = new ContainerAnnotation.Anchor(this, 'isStart');
    }
    return this._startAnchor;
  },

  getEndAnchor: function() {
    if (!this._endAnchor) {
      this._endAnchor = new ContainerAnnotation.Anchor(this);
    }
    return this._endAnchor;
  },

  getStartPath: function() {
    return this.startPath;
  },

  getEndPath: function() {
    return this.endPath;
  },

  getStartOffset: function() {
    return this.startOffset;
  },

  getEndOffset: function() {
    return this.endOffset;
  },

  // Provide a selection which has the same range as this annotation.
  getSelection: function() {
    var doc = this.getDocument();
    // Guard: when this is called while this node has been detached already.
    if (!doc) {
      console.warn('Trying to use a ContainerAnnotation which is not attached to the document.');
      return Selection.nullSelection();
    }
    return doc.createSelection({
      type: "container",
      containerId: this.container,
      startPath: this.startPath,
      startOffset: this.startOffset,
      endPath: this.endPath,
      endOffset: this.endOffset
    });
  },

  getText: function() {
    var doc = this.getDocument();
    if (!doc) {
      console.warn('Trying to use a ContainerAnnotation which is not attached to the document.');
      return "";
    }
    return doc.getTextForSelection(this.getSelection());
  },

  updateRange: function(tx, sel) {
    if (!sel.isContainerSelection()) {
      throw new Error('Cannot change to ContainerAnnotation.');
    }
    if (!_.isEqual(this.startPath, sel.start.path)) {
      tx.set([this.id, 'startPath'], sel.start.path);
    }
    if (this.startOffset !== sel.start.offset) {
      tx.set([this.id, 'startOffset'], sel.start.offset);
    }
    if (!_.isEqual(this.endPath, sel.end.path)) {
      tx.set([this.id, 'endPath'], sel.end.path);
    }
    if (this.endOffset !== sel.end.offset) {
      tx.set([this.id, 'endOffset'], sel.end.offset);
    }
  },


  setHighlighted: function(highlighted) {

    if (this.highlighted !== highlighted) {
      this.highlighted = highlighted;
      this.emit('highlighted', highlighted);

      _.each(this.fragments, function(frag) {
        frag.emit('highlighted', highlighted);
      });
    }
  },

  // FIXME: this implementation will not prune old fragments
  getFragments: function() {
    var fragments = [];
    var doc = this.getDocument();
    var container = doc.get(this.container);
    var paths = container.getPathRange(this.startPath, this.endPath);
    if (paths.length === 1) {
      fragments.push(new ContainerAnnotation.Fragment(this, paths[0], "property"));
    } else if (paths.length > 1) {
      fragments.push(new ContainerAnnotation.Fragment(this, paths[0], "start"));
      fragments.push(new ContainerAnnotation.Fragment(this, _.last(paths), "end"));
      for (var i = 1; i < paths.length-1; i++) {
        fragments.push(new ContainerAnnotation.Fragment(this, paths[i], "inner"));
      }
    }
    return fragments;
  },

});

ContainerAnnotation.Anchor = function Anchor(anno, isStart) {
  EventEmitter.call(this);
  this.type = "container-annotation-anchor";
  this.anno = anno;
  // TODO: remove this.node in favor of this.anno
  this.node = anno;
  this.id = anno.id;
  this.container = anno.container;
  this.isStart = !!isStart;
  Object.freeze(this);
};

ContainerAnnotation.Anchor.Prototype = function() {
  _.extend(this, EventEmitter.prototype);

  this.zeroWidth = true;

  this.getTypeNames = function() {
    return [this.type];
  };
};

oo.initClass(ContainerAnnotation.Anchor);

ContainerAnnotation.Fragment = function Fragment(anno, path, mode) {
  EventEmitter.call(this);

  this.type = "container-annotation-fragment";
  this.anno = anno;
  // HACK: id is necessary for Annotator
  this.id = anno.id;
  this.path = path;
  this.mode = mode;
};

ContainerAnnotation.Fragment.Prototype = function() {
  _.extend(this, EventEmitter.prototype);

  this.getTypeNames = function() {
    return [this.type];
  };
};

oo.initClass(ContainerAnnotation.Fragment);

Object.defineProperties(ContainerAnnotation.Fragment.prototype, {
  startOffset: {
    get: function() {
      return ( (this.mode === "start" || this.mode === "property") ? this.anno.startOffset : 0);
    },
    set: function() { throw new Error('Immutable!'); }
  },
  endOffset: {
    get: function() {
      var doc = this.anno.getDocument();
      var textProp = doc.get(this.path);
      var length = textProp.length;
      return ( (this.mode === "end" || this.mode === "property") ? this.anno.endOffset : length);
    },
    set: function() { throw new Error('Immutable!'); }
  },
  highlighted: {
    get: function() {
      return this.anno.highlighted;
    },
    set: function() { throw new Error('Immutable!'); }
  }
});


ContainerAnnotation.Fragment.static.level = Number.MAX_VALUE;

Object.defineProperties(ContainerAnnotation.Anchor.prototype, {
  path: {
    get: function() {
      return (this.isStart ? this.node.startPath : this.node.endPath);
    },
    set: function() { throw new Error('Immutable!'); }
  },
  offset: {
    get: function() {
      return (this.isStart ? this.node.startOffset : this.node.endOffset);
    },
    set: function() { throw new Error('Immutable!'); }
  },
});

module.exports = ContainerAnnotation;