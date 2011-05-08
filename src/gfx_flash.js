/*!
* x3dom javascript library 0.1
* http://x3dom.org/
*
* Copyright (c) 2009 Peter Eschler, Johannes Behr, Yvonne Jung
*     based on code originally provided by Philip Taylor:
*     http://philip.html5.org
* Dual licensed under the MIT and GPL licenses.
* 
*/

x3dom.bridge = {

	setFlashReady: function(driver, canvas) {
		var x3dCanvas = x3dom.canvases[canvas];
		x3dCanvas.isFlashReady = true;
		x3dom.debug.logInfo('Flash is ready for rendering (' + driver + ')');
	},
	
	onMouseDown: function(x, y, button, canvas) {
		var x3dCanvas = x3dom.canvases[canvas];
		x3dCanvas.doc.onMousePress(x3dCanvas.gl, x, y, button);
		x3dCanvas.doc.needRender = true;
	},
	
	onMouseUp: function(x, y, button, canvas) {
		var x3dCanvas = x3dom.canvases[canvas];
		x3dCanvas.doc.onMouseRelease(x3dCanvas.gl, x, y, button);
		x3dCanvas.doc.needRender = true;
	},

	onMouseOver: function(x, y, button, canvas) {
		var x3dCanvas = x3dom.canvases[canvas];
		x3dCanvas.doc.onMouseOver(x3dCanvas.gl, x, y, button);
		x3dCanvas.doc.needRender = true;
	},

	onMouseOut: function(x, y, button, canvas) {
		var x3dCanvas = x3dom.canvases[canvas];
		x3dCanvas.doc.onMouseOut(x3dCanvas.gl, x, y, button);
		x3dCanvas.doc.needRender = true;
	},

	onDoubleClick: function(x, y, canvas) {
		var x3dCanvas = x3dom.canvases[canvas];
		x3dCanvas.doc.onDoubleClick(x3dCanvas.gl, x, y);
		x3dCanvas.doc.needRender = true;
		x3dom.debug.logInfo("dblClick");
	},

	onMouseMove: function(x, y, button, canvas) {
		var x3dCanvas = x3dom.canvases[canvas];
		x3dCanvas.doc.onDrag(x3dCanvas.gl, x, y, button);
		x3dCanvas.doc.needRender = true;
	},

	onMouseWheel: function(x, y, button, canvas) {
		var x3dCanvas = x3dom.canvases[canvas];
		x3dCanvas.doc.onDrag(x3dCanvas.gl, x, y, button);
		x3dCanvas.doc.needRender = true;
	},

	onKeyDown: function(charCode, canvas) {
		var x3dCanvas = x3dom.canvases[canvas];
		var keysEnabled = x3dCanvas.x3dElem.getAttribute("keysEnabled");
		if (!keysEnabled || keysEnabled.toLowerCase() === "true") {
			x3dCanvas.doc.onKeyPress(charCode);
		}
		x3dCanvas.doc.needRender = true;
	}
};



x3dom.gfx_flash = (function() {

	/**
	*
	*/
	function Context(object, name) {
		this.object = object;
		this.name = name;
		this.skySphere = false;
	};
	
	/**
	*
	*/
	function setupContext(object) {
		return new Context(object, 'flash');
	};
	
	/**
	*
	*/
	Context.prototype.getName = function() {
		return this.name;
	};
	
	/**
	*
	*/
	Context.prototype.renderScene = function (viewarea) {
		//Get Scene from Viewarea
        var scene = viewarea._scene;
		
		//Setup the flash scene
		this.setupScene(scene, viewarea);
		
		//Get background node
		var background = scene.getBackground();
		
		//Setup the background
		this.setupBackground(background);
		
		//Collect all drawableObjects
		scene.drawableObjects = [];
		scene.collectDrawableObjects(x3dom.fields.SFMatrix4f.identity(), scene.drawableObjects);
		
		//Get Number of drawableObjects
		var numDrawableObjects = scene.drawableObjects.length;
		
		//Iterate over all Objects for setup
		for(var i=0; i<numDrawableObjects; i++) 
		{
			//Get object and transformation
			var trafo = scene.drawableObjects[i][0];
			var obj3d = scene.drawableObjects[i][1];
			
			this.setupShape(obj3d, trafo);
		}
		
		//Render the flash scene
		this.object.renderScene();
	};
	
	/**
	*
	*/
	Context.prototype.setupScene = function(scene, viewarea) {
		//Set View-Matrix
		var mat_view = viewarea.getViewMatrix();
		this.object.setViewMatrix( { viewMatrix: mat_view.toGL() });
		
		//Set Projection-Matrix
        var mat_proj = viewarea.getProjectionMatrix();
		this.object.setProjectionMatrix( { projectionMatrix: mat_proj.toGL() });
		
		//Set HeadLight
		var nav = scene.getNavigationInfo();
        if(nav._vf.headlight){
			this.object.setLights( { idx: 0,
									 type: 0,
									 on: 1.0,
									 color: [1.0, 1.0, 1.0],
									 intensity: 1.0,
									 ambientIntensity: 0.0,
									 direction: [0.0, 0.0, 1.0],
									 attenuation: [1.0, 1.0, 1.0],
									 location: [1.0, 1.0, 1.0],
									 radius: 0.0,
									 beamWidth: 0.0,
									 cutOffAngle: 0.0 } );
		}
		
		//TODO Set Lights
		/*var lights = viewarea.getLights();
		for(var i=0; i<lights.length; i++) {
			this.object.setLights( { } );
		}*/
	};
	
	/**
	*
	*/
	Context.prototype.setupBackground = function(background) {
		//If background dirty -> update
		if(background._dirty)
		{
			this.object.setBackground( { texURLs: background.getTexUrl(),
										 skyAngle: background._vf.skyAngle,
										 skyColor: background.getSkyColor().toGL(),
										 groundAngle: background._vf.groundAngle,
										 groundColor: background.getGroundColor().toGL(),
										 transparency: background.getTransparency() } );
			background._dirty = false;
			
			if(!this.skySphere)
			{
				var sphere = new x3dom.nodeTypes.Sphere();
				/*this.object.setSkySphere( { vertices: sphere._mesh._positions[0],
											texCoords: sphere._mesh._texCoords[0],
											indices: sphere._mesh._indices[0] } );
				this.skySphere = true;*/
			}
		}
	};
	
	/**
	*
	*/
	Context.prototype.setupShape = function(shape, trafo) {
		
		//Check shape geometry type
		if (x3dom.isa(shape._cf.geometry.node, x3dom.nodeTypes.PointSet)) {
			x3dom.debug.logError("Flash backend don't support PointSets yet");
			return;
		} else if (x3dom.isa(shape._cf.geometry.node, x3dom.nodeTypes.IndexedLineSet)) {
			x3dom.debug.logError("Flash backend don't support LineSets yet");
			return;
		} else if (x3dom.isa(shape._cf.geometry.node, x3dom.nodeTypes.Text)) { 
			this.setupText(shape, trafo);
		} else {
		//
			//Set modelMatrix
			this.object.setMeshTransform( { id: shape._objectID,
											transform: trafo.toGL() } );
											
			if( shape._dirty.indexes === true ) {
				for( var i=0; i<shape._cf.geometry.node._mesh._indices.length; i++ ) {
					this.object.setMeshIndices( { id: shape._objectID, 
												  idx: i, 
												  indices: shape._cf.geometry.node._mesh._indices[i] } ); 
				}
				shape._dirty.indexes = false;
			}
			
			if( shape._dirty.positions === true ) {
				for( var i=0; i<shape._cf.geometry.node._mesh._positions.length; i++ ) {
					this.object.setMeshVertices( { id: shape._objectID, 
												   idx: i, 
												   vertices: shape._cf.geometry.node._mesh._positions[i] } );
				}
				shape._dirty.positions = false;
			}
			
			if( shape._dirty.normals === true ) {
				if(shape._cf.geometry.node._mesh._normals[0].length) {
					for( var i=0; i<shape._cf.geometry.node._mesh._normals.length; i++ ) {
						this.object.setMeshNormals( { id: shape._objectID, 
													  idx: i, 
													  normals: shape._cf.geometry.node._mesh._normals[i] } );
					}
				}
				shape._dirty.normals = false;
			}
			
			if( shape._dirty.colors === true ) {
				if(shape._cf.geometry.node._mesh._colors[0].length) {
					for( var i=0; i<shape._cf.geometry.node._mesh._colors.length; i++ ) {
						this.object.setMeshColors( { id: shape._objectID, 
													 idx: i, 
													 colors: shape._cf.geometry.node._mesh._colors[i] } );
					}
				}
				shape._dirty.colors = false;
			}
			
			if( shape._dirty.texcoords === true ) {
				if(shape._cf.geometry.node._mesh._texCoords[0].length) {
					for( var i=0; i<shape._cf.geometry.node._mesh._texCoords.length; i++ ) {
						this.object.setMeshTexCoords( { id: shape._objectID, 
														idx: i, 
														texCoords: shape._cf.geometry.node._mesh._texCoords[i] } );
					}
				}
				shape._dirty.texcoords = false;
			}
			
			if( shape._dirty.material === true ) {
				var material = shape._cf.appearance.node._cf.material.node;
				this.object.setMeshMaterial( { id: shape._objectID, 
											   ambientIntensity: material._vf.ambientIntensity,
											   diffuseColor: material._vf.diffuseColor.toGL(),
											   emissiveColor: material._vf.emissiveColor.toGL(),
											   shininess: material._vf.shininess,
											   specularColor: material._vf.specularColor.toGL(),
											   transparency: material._vf.transparency } );
				shape._dirty.material = false;
			}
			
			if( shape._dirty.texture === true ) {
				var texture = shape._cf.appearance.node._cf.texture.node;
				if(texture) {
					this.object.setMeshTexture( { id: shape._objectID,
												  origChannelCount: texture._vf.origChannelCount,
												  repeatS: texture._vf.repeatS,
												  repeatT: texture._vf.repeatT,
												  url: texture._vf.url[0] } );
				}
				shape._dirty.texture = false;
			}
			
			if (shape._cf.geometry.node._cf.texCoord !== undefined &&
                shape._cf.geometry.node._cf.texCoord.node !== null &&
                shape._cf.geometry.node._cf.texCoord.node._vf.mode)
            {
                var texMode = shape._cf.geometry.node._cf.texCoord.node._vf.mode;
                if (texMode.toLowerCase() == "sphere") {
                    this.object.setSphereMapping( { id: shape._objectID,
													sphereMapping: 1 } );
                }
                else {
                    this.object.setSphereMapping( { id: shape._objectID,
													sphereMapping: 0 } );
                }
            }
            else {
                this.object.setSphereMapping( { id: shape._objectID,
												sphereMapping: 0 } );
            }
		}
	
	};
	
	Context.prototype.setupText = function(shape, trafo) 
	{
		if( shape._dirty.text === true ) {
			var fontStyleNode = shape._cf.geometry.node._cf.fontStyle.node;
			if (fontStyleNode === null) {
				this.object.setText( { id: shape._objectID,
									   text: shape._cf.geometry.node._vf.string,
									   fontFamily: ['SERIF'],
									   fontStyle: "PLAIN",
									   fontAlign: "BEGIN",
									   fontSize: 32,
									   fontSpacing: 1.0,
									   fontHorizontal: true,
									   fontLanguage: "",
									   fontLeftToRight: true,
									   fontTopToBottom: true } );
			} else {
				this.object.setText( { id: shape._objectID,
									   text: shape._cf.geometry.node._vf.string,
									   fontFamily: fontStyleNode._vf.family.toString(),
									   fontStyle: fontStyleNode._vf.style.toString(),
									   fontAlign: fontStyleNode._vf.justify.toString(),
									   fontSize: fontStyleNode._vf.size,
									   fontSpacing: fontStyleNode._vf.spacing,
									   fontHorizontal: fontStyleNode._vf.horizontal,
									   fontLanguage: fontStyleNode._vf.language,
									   fontLeftToRight: fontStyleNode._vf.leftToRight,
									   fontTopToBottom: fontStyleNode._vf.topToBottom } );
			}
			shape._dirty.text = false; 
		}
		
		if( shape._dirty.material === true ) {
			var material = shape._cf.appearance.node._cf.material.node;
			this.object.setMeshMaterial( { id: shape._objectID, 
										   ambientIntensity: material._vf.ambientIntensity,
										   diffuseColor: material._vf.diffuseColor.toGL(),
										   emissiveColor: material._vf.emissiveColor.toGL(),
										   shininess: material._vf.shininess,
										   specularColor: material._vf.specularColor.toGL(),
										   transparency: material._vf.transparency } );
			shape._dirty.material = false;
		}
		
		//Set modelMatrix
		this.object.setMeshTransform( { id: shape._objectID,
										transform: trafo.toGL() } );
	};
	/**
	*
	*/
	Context.prototype.pickValue = function(viewarea, x, y)
	{
	
	};
	
	/**
	*
	*/
	Context.prototype.shutdown = function(viewarea)
	{
	
	};
	
	//Return the setup context function
	return setupContext;
})();