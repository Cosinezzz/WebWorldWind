/*
 * Copyright 2015-2018 WorldWind Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
/**
 * @exports ShapeEditor
 */
define([
        '../../shapes/Annotation',
        '../../shapes/AnnotationAttributes',
        '../../error/ArgumentError',
        '../Color',
        '../Font',
        '../Insets',
        '../../geom/Location',
        '../Logger',
        '../../shapes/Placemark',
        '../../shapes/PlacemarkAttributes',
        '../../geom/Position',
        '../../layer/RenderableLayer',
        '../../shapes/ShapeAttributes',
        './ShapeEditorConstants',
        './SurfaceEllipseEditorFragment',
        './SurfaceCircleEditorFragment',
        '../../shapes/SurfacePolygon',
        './SurfacePolygonEditorFragment',
        './SurfacePolylineEditorFragment',
        './SurfaceRectangleEditorFragment',
        '../../geom/Vec2',
        '../../geom/Vec3'
    ],
    function (Annotation,
              AnnotationAttributes,
              ArgumentError,
              Color,
              Font,
              Insets,
              Location,
              Logger,
              Placemark,
              PlacemarkAttributes,
              Position,
              RenderableLayer,
              ShapeAttributes,
              ShapeEditorConstants,
              SurfaceEllipseEditorFragment,
              SurfaceCircleEditorFragment,
              SurfacePolygon,
              SurfacePolygonEditorFragment,
              SurfacePolylineEditorFragment,
              SurfaceRectangleEditorFragment,
              SurfaceShape,
              Vec2,
              Vec3) {
        "use strict";

        /**
         * Constructs a new shape editor attached to the specified World Window.
         * @alias ShapeEditor
         * @classdesc Provides a controller for editing shapes. Depending on the type of shape, the following actions
         * are available:
         * <ul>
         *     <li>Edit the location and size of its vertexes using control points;</li>
         *     <li>Rotate the shape using a handle;</li>
         *     <li>Drag the shape on the surface of the globe.</li>
         * </ul>
         * <p>
         * To start editing a shape, pass it to the {@link ShapeEditor#edit} method. To end the edition, call the
         * {@link ShapeEditor#stop} method.
         * <p>
         * Dragging the body of the shape moves the whole shape. Dragging a control point performs the action associated
         * with that control point. The editor provides vertex insertion and removal for SurfacePolygon and
         * SurfacePolyline. Shift-clicking when the cursor is over the shape inserts a control point near the position
         * of the cursor. Alt-clicking when the cursor is over a control point removes that particular control point.
         * <p>
         * This editor currently supports all surface shapes except SurfaceImage.
         * @param {WorldWindow} worldWindow The World Window to associate this shape editor controller with.
         * @throws {ArgumentError} If the specified World Window is <code>null</code> or <code>undefined</code>.
         * @constructor
         */
        var ShapeEditor = function (worldWindow) {
            if (!worldWindow) {
                throw new ArgumentError(Logger.logMessage(Logger.LEVEL_SEVERE, "ShapeEditor", "constructor",
                    "missingWorldWindow"));
            }

            // Documented in defineProperties below.
            this._worldWindow = worldWindow;

            // Documented in defineProperties below.
            this._shape = null;

            // Documented in defineProperties below.
            this._moveControlPointAttributes = new PlacemarkAttributes(null);
            this._moveControlPointAttributes.imageColor = WorldWind.Color.BLUE;
            this._moveControlPointAttributes.imageScale = 6;

            // Documented in defineProperties below.
            this._resizeControlPointAttributes = new PlacemarkAttributes(null);
            this._resizeControlPointAttributes.imageColor = WorldWind.Color.CYAN;
            this._resizeControlPointAttributes.imageScale = 6;

            // Documented in defineProperties below.
            this._rotateControlPointAttributes = new PlacemarkAttributes(null);
            this._rotateControlPointAttributes.imageColor = WorldWind.Color.GREEN;
            this._rotateControlPointAttributes.imageScale = 6;

            // Documented in defineProperties below.
            this._annotationAttributes = new AnnotationAttributes(null);
            this._annotationAttributes.altitudeMode = WorldWind.CLAMP_TO_GROUND;
            this._annotationAttributes.cornerRadius = 5;
            this._annotationAttributes.backgroundColor = new Color(0.67, 0.67, 0.67, 0.8);
            this._annotationAttributes._leaderGapHeight = 0;
            this._annotationAttributes.drawLeader = false;
            this._annotationAttributes.scale = 1;
            this._annotationAttributes._textAttributes.color = Color.BLACK;
            this._annotationAttributes._textAttributes.font = new Font(10);
            this._annotationAttributes.insets = new Insets(5, 5, 5, 5);

            // Internal use only.
            // The annotation that displays hints during the actions on the shape.
            this.annotation = new WorldWind.Annotation(new WorldWind.Position(0, 0, 0), this._annotationAttributes);

            //Internal use only. Intentionally not documented.
            this.editorFragments = [
                new SurfaceCircleEditorFragment(),
                new SurfaceEllipseEditorFragment(),
                new SurfacePolygonEditorFragment(),
                new SurfacePolylineEditorFragment(),
                new SurfaceRectangleEditorFragment()
            ];

            // Internal use only.
            // The layer that holds the control points created by the editor fragment.
            this.controlPointsLayer = new RenderableLayer("Shape Editor Control Points");

            // Internal use only.
            // The layers that holds the additional accessories created by the editor fragment.
            this.accessoriesLayer = new RenderableLayer("Shape Editor Accessories");
            this.accessoriesLayer.pickEnabled = false;

            // Internal use only.
            // The layer that holds the above-mentioned annotation.
            this.annotationLayer = new RenderableLayer("Shape Editor Annotation");
            this.annotationLayer.pickEnabled = false;
            this.annotationLayer.enabled = false;
            this.annotationLayer.addRenderable(this.annotation);

            // Internal use only.
            // The layer that holds the shadow of the shape during the actions.
            this.shadowShapeLayer = new RenderableLayer("Shape Editor Shadow Shape");
            this.shadowShapeLayer.pickEnabled = false;

            // Internal use only.
            // The editor fragment selected for the shape being edited or null.
            this.activeEditorFragment = null;

            // Internal use only.
            // The type of action being conducted or null.
            this.actionType = null;

            // Internal use only.
            // The control point that triggered the current action or null.
            this.actionControlPoint = null;

            // Internal use only.
            // The lat/lon/alt position that is currently involved with the action or null.
            this.actionControlPosition = null;

            // Internal use only.
            // Flag indicating whether the action should trigger the secondary behavior in the editor fragment.
            this.actionSecondaryBehavior = false;

            // Internal use only.
            // The client X position at the start of the action.
            this.actionStartX = null;

            //Internal use only.
            // The client Y position at the start of the action.
            this.actionStartY = null;

            // Internal use only.
            // The current client X position for the action.
            this.actionCurrentX = null;

            // Internal use only.
            // The current client Y position for the action.
            this.actionCurrentY = null;

            // Internal use only.
            // The original highlight attributes of the shape in order to restore them after the action.
            this.originalHighlightAttributes = new ShapeAttributes(null);

            this._worldWindow.worldWindowController.addGestureListener(this);
        };

        Object.defineProperties(ShapeEditor.prototype, {
            /**
             * The World Window associated with this shape editor.
             * @memberof ShapeEditor.prototype
             * @type {WorldWindow}
             * @readonly
             */
            worldWindow: {
                get: function () {
                    return this._worldWindow;
                }
            },

            /**
             * The shape currently being edited.
             * @memberof ShapeEditor.prototype
             * @type {Object}
             * @readonly
             */
            shape: {
                get: function () {
                    return this._shape;
                }
            },

            /**
             * Attributes used for the control points that move the boundaries of the shape.
             * @memberof ShapeEditor.prototype
             * @type {PlacemarkAttributes}
             */
            moveControlPointAttributes: {
                get: function () {
                    return this._moveControlPointAttributes;
                },
                set: function (value) {
                    this._moveControlPointAttributes = value;
                }
            },

            /**
             * Attributes used for the control points that resize the shape.
             * @memberof ShapeEditor.prototype
             * @type {PlacemarkAttributes}
             */
            resizeControlPointAttributes: {
                get: function () {
                    return this._resizeControlPointAttributes;
                },
                set: function (value) {
                    this._resizeControlPointAttributes = value;
                }
            },

            /**
             * Attributes used for the control points that rotate the shape.
             * @memberof ShapeEditor.prototype
             * @type {PlacemarkAttributes}
             */
            rotateControlPointAttributes: {
                get: function () {
                    return this._rotateControlPointAttributes;
                },
                set: function (value) {
                    this._rotateControlPointAttributes = value;
                }
            },

            /**
             * Attributes used for the annotation that displays hints during the actions on the shape.
             * @memberof ShapeEditor.prototype
             * @type {AnnotationAttributes}
             */
            annotationAttributes: {
                get: function () {
                    return this._annotationAttributes;
                },
                set: function (value) {
                    this._annotationAttributes = value;
                    this.annotation.attributes = value;
                }
            }
        });

        /**
         * Edits the specified shape. Currently, only surface shapes are supported.
         * @param {SurfaceShape} shape The shape to edit.
         * @return {Boolean} <code>true</code> if the editor could start the edition of the specified shape; otherwise
         * <code>false</code>.
         */
        ShapeEditor.prototype.edit = function (shape) {
            this.stop();

            // Look for a fragment that can handle the specified shape
            for (var i = 0, len = this.editorFragments.length; i < len; i++) {
                var editorFragment = this.editorFragments[i];
                if (editorFragment.canHandle(shape)) {
                    this.activeEditorFragment = editorFragment;
                }
            }

            // If we have a fragment for this shape, accept the shape and start the edition
            if (this.activeEditorFragment != null) {
                this._shape = shape;
                this.initializeControlElements();
                return true;
            }

            return false;
        };

        /**
         * Stops the current edition activity if any.
         * @return {SurfaceShape} The shape being edited if any; otherwise <code>null</code>.
         */
        ShapeEditor.prototype.stop = function () {
            this.removeControlElements();

            this.activeEditorFragment = null;

            var currentShape = this._shape;
            this._shape = null;
            return currentShape;
        };

        // Internal use only.
        // Called by {@link ShapeEditor#edit} to initialize the control elements used for editing.
        ShapeEditor.prototype.initializeControlElements = function () {
            if (this._worldWindow.indexOfLayer(this.shadowShapeLayer) == -1) {
                this._worldWindow.insertLayer(0, this.shadowShapeLayer);
            }

            if (this._worldWindow.indexOfLayer(this.controlPointsLayer) == -1) {
                this._worldWindow.addLayer(this.controlPointsLayer);
            }

            if (this._worldWindow.indexOfLayer(this.accessoriesLayer) == -1) {
                this._worldWindow.addLayer(this.accessoriesLayer);
            }

            if (this._worldWindow.indexOfLayer(this.annotationLayer) == -1) {
                this._worldWindow.addLayer(this.annotationLayer);
            }

            this.activeEditorFragment.initializeControlElements(
                this._shape,
                this.controlPointsLayer.renderables,
                this.accessoriesLayer.renderables,
                this._resizeControlPointAttributes,
                this._rotateControlPointAttributes,
                this._moveControlPointAttributes
            );

            this.updateControlElements();
        };

        // Internal use only.
        // Called by {@link ShapeEditor#stop} to remove the control elements used for editing.
        ShapeEditor.prototype.removeControlElements = function () {
            this._worldWindow.removeLayer(this.controlPointsLayer);
            this.controlPointsLayer.removeAllRenderables();

            this._worldWindow.removeLayer(this.accessoriesLayer);
            this.accessoriesLayer.removeAllRenderables();

            this._worldWindow.removeLayer(this.shadowShapeLayer);
            this.shadowShapeLayer.removeAllRenderables();

            this._worldWindow.removeLayer(this.annotationLayer);
        };

        // Internal use only.
        // Updates the position of the control elements.
        ShapeEditor.prototype.updateControlElements = function () {
            this.activeEditorFragment.updateControlElements(
                this._shape,
                this._worldWindow.globe,
                this.controlPointsLayer.renderables,
                this.accessoriesLayer.renderables
            );
        };

        // Internal use only.
        // Dispatches the events relevant to the shape editor.
        ShapeEditor.prototype.onGestureEvent = function (event) {
            if(this._shape === null) {
                return;
            }

            // TODO Add support for touch devices

            if (event.type === "pointerup" || event.type === "mouseup") {
                this.handleMouseUp(event);
            } else if (event.type === "pointerdown" || event.type === "mousedown") {
                this.handleMouseDown(event);
            } else if (event.type === "pointermove" || event.type === "mousemove") {
                this.handleMouseMove(event);
            }
        };

        // Internal use only.
        // Triggers an action if the shape below the mouse is the shape being edited or a control point.
        ShapeEditor.prototype.handleMouseDown = function (event) {
            var x = event.clientX,
                y = event.clientY;

            this.actionStartX = x;
            this.actionStartY = y;
            this.actionCurrentX = x;
            this.actionCurrentY = y;

            var mousePoint = this._worldWindow.canvasCoordinates(x, y);
            var pickList = this._worldWindow.pick(mousePoint);

            for (var p = 0, len = pickList.objects.length; p < len; p++) {
                var object = pickList.objects[p];

                if (!object.isTerrain) {
                    var userObject = object.userObject;
                    var terrainObject = pickList.terrainObject();

                    if (userObject === this._shape) {
                        this.beginAction(terrainObject.position, event.altKey);
                        event.preventDefault();
                        break;

                    } else if (this.controlPointsLayer.renderables.indexOf(userObject) ) {
                        this.beginAction(terrainObject.position, event.altKey, userObject);
                        event.preventDefault();
                        break;
                    }
                }
            }
        };

        // Internal use only.
        // Updates the current action if any.
        ShapeEditor.prototype.handleMouseMove = function (event) {
            if (this.actionType) {

                var mousePoint = this._worldWindow.canvasCoordinates(event.clientX, event.clientY);
                var terrainObject = this._worldWindow.pickTerrain(mousePoint).terrainObject();

                if (terrainObject) {
                    if (this.actionType === ShapeEditorConstants.DRAG) {
                        this.drag(event.clientX, event.clientY);

                    } else {
                        this.reshape(terrainObject.position);
                    }

                    event.preventDefault();
                }
            }
        };

        // Internal use only.
        // Terminates the current action if any; otherwise handles other click responses.
        ShapeEditor.prototype.handleMouseUp = function (event) {
            var mousePoint = this._worldWindow.canvasCoordinates(event.clientX, event.clientY);
            var terrainObject = this._worldWindow.pickTerrain(mousePoint).terrainObject();

            if (this.actionType) {
                if (this.actionControlPoint
                    && terrainObject
                    && event.altKey) { // FIXME What is this for?
                        this.reshape(terrainObject.position);
                }

                this.endAction();

            } else if (terrainObject
                       && this.actionStartX === this.actionCurrentX // FIXME Is this check needed?
                       && this.actionStartY === this.actionCurrentY // FIXME Is this check needed?
                       && event.shiftKey) {

                var pickList = this._worldWindow.pick(mousePoint);
                for (var p = 0, len = pickList.objects.length; p < len; p++) {

                    if (!pickList.objects[p].isTerrain) { // FIXME Shouldn't it check that we are on the shape instead of any object?
                        this.activeEditorFragment.addNewControlPoint(
                            this._worldWindow.globe,
                            terrainObject.position,
                            0,
                            this._shape.boundaries
                        );
                        break;
                    }
                }
            }
        };

        // Internal use only.
        ShapeEditor.prototype.beginAction = function (initialPosition, alternateAction, controlPoint) {
            // Define the active transformation
            if (controlPoint) {
                this.actionType = controlPoint.userProperties.purpose;
            } else {
                this.actionType = ShapeEditorConstants.DRAG;
            }
            this.actionControlPoint = controlPoint;
            this.actionControlPosition = initialPosition;
            this.actionSecondaryBehavior = alternateAction;

            // Place a shadow shape at the original location of the shape
            this.originalHighlightAttributes = this._shape.highlightAttributes;

            var editingAttributes = new ShapeAttributes(this.originalHighlightAttributes);
            editingAttributes.interiorColor.alpha = editingAttributes.interiorColor.alpha * 0.7;

            var shadowShape = this.activeEditorFragment.createShadowShape(this._shape);
            shadowShape.highlightAttributes = new ShapeAttributes(this.originalHighlightAttributes);
            shadowShape.highlighted = true;

            this.shadowShapeLayer.addRenderable(shadowShape);

            this._worldWindow.redraw();
        };

        // Internal use only.
        ShapeEditor.prototype.endAction = function () {
            this.shadowShapeLayer.removeAllRenderables();

            this._shape.highlightAttributes = this.originalHighlightAttributes;
            
            this.hideAnnotation();

            this.actionControlPoint = null;
            this.actionType = null;
            this.actionControlPosition = null;

            this._worldWindow.redraw();
        };

        // Internal use only.
        ShapeEditor.prototype.reshape = function (newPosition) {
            this.activeEditorFragment.reshape(
                this._shape,
                this._worldWindow.globe,
                this.actionControlPoint,
                newPosition,
                this.actionControlPosition,
                this.actionSecondaryBehavior
            );

            this.actionControlPosition = newPosition;

            this.updateControlElements();
            this.updateAnnotation(this.actionControlPoint);

            this._worldWindow.redraw();
        };

        // Internal use only.
        ShapeEditor.prototype.drag = function (clientX, clientY) {
            // FIXME To be reviewed
            var refPos = this._shape.getReferencePosition();

            var refPoint = this._worldWindow.globe.computePointFromPosition(
                refPos.latitude,
                refPos.longitude,
                0,
                new Vec3(0, 0, 0)
            );

            var screenRefPoint = new Vec3(0, 0, 0);
            this._worldWindow.drawContext.project(refPoint, screenRefPoint);

            var dx = clientX - this.actionCurrentX;
            var dy = clientY - this.actionCurrentY;

            this.actionCurrentX = clientX;
            this.actionCurrentY = clientY;

            // Find intersection of the screen coordinates ref-point with globe
            var x = screenRefPoint[0] + dx;
            var y = this._worldWindow.canvas.height - screenRefPoint[1] + dy;

            var ray = this._worldWindow.rayThroughScreenPoint(new Vec2(x, y));

            var intersection = new Vec3(0, 0, 0);
            if (this._worldWindow.globe.intersectsLine(ray, intersection)) {
                var p = new Position(0, 0, 0);
                this._worldWindow.globe.computePositionFromPoint(intersection[0], intersection[1],
                    intersection[2], p);
                this._shape.moveTo(this._worldWindow.globe, new Location(p.latitude, p.longitude));
            }

            this.updateControlElements();
            this.updateShapeAnnotation();

            this._worldWindow.redraw();
        };

        // Internal use only.
        ShapeEditor.prototype.updateAnnotation = function (controlPoint) {
            this.annotationLayer.enabled = true;

            this.annotation.position = new Position(
                controlPoint.position.latitude,
                controlPoint.position.longitude,
                0
            );

            var annotationText;
            if (controlPoint.userProperties.size !== undefined) {
                annotationText = this.formatLength(controlPoint.userProperties.size);
            }
            else if (controlPoint.userProperties.rotation !== undefined) {
                annotationText = this.formatRotation(controlPoint.userProperties.rotation);
            }
            else {
                annotationText = this.formatLatitude(controlPoint.position.latitude)
                    + " "
                    + this.formatLongitude(controlPoint.position.longitude);
            }
            this.annotation.text = annotationText;
        };

        // Internal use only.
        ShapeEditor.prototype.hideAnnotation = function (controlPoint) {
            this.annotationLayer.enabled = false;
        };

        // Internal use only.
        ShapeEditor.prototype.updateShapeAnnotation = function () {
            var center = this.activeEditorFragment.getShapeCenter(this._shape);

            if (center !== null) {
                var dummyMarker = new Placemark(
                    new Position(center.latitude, center.longitude, 0),
                    null
                );
                dummyMarker.userProperties.isControlPoint = true;
                dummyMarker.userProperties.id = 0;
                dummyMarker.userProperties.purpose = ShapeEditor.ANNOTATION;
                this.updateAnnotation(dummyMarker);

            } else {
                this.hideAnnotation();
            }
        };

        // Internal use only.
        ShapeEditor.prototype.formatLatitude = function (number) {
            var suffix = number < 0 ? "\u00b0S" : "\u00b0N";
            return Math.abs(number).toFixed(4) + suffix;
        };

        // Internal use only.
        ShapeEditor.prototype.formatLongitude = function (number) {
            var suffix = number < 0 ? "\u00b0W" : "\u00b0E";
            return Math.abs(number).toFixed(4) + suffix;
        };

        // Internal use only.
        ShapeEditor.prototype.formatLength = function (number) {
            var suffix = " km";
            return Math.abs(number / 1000.0).toFixed(3) + suffix;
        };

        // Internal use only.
        ShapeEditor.prototype.formatRotation = function (rotation) {
            return rotation.toFixed(4) + "°";
        };

        return ShapeEditor;
    }
);