/**
 * Created by Sven Kluge on 27.06.2016.
 */

if(x3dom.glTF == null)
    x3dom.glTF = {};

x3dom.glTF.ParameterType = {
    SAMPLER_2D : 35678,
    SAMPLER_CUBE: 35680
}

x3dom.glTF.glTFLoader = function(meshOnly, encoding, baseURL)
{
    this.encoding = encoding || "binary";
    
    this.meshOnly = meshOnly;
    
    this.header = null; 
    
    this.buffers = [];
    
    this._mesh = {};
    
    this.state = 0;
    
    this.baseURL = baseURL || "";
    
    this.loaded = { images: {}, meshes : {}, bufferViews: null, shaders: {}, meshCount: 0};
    
    this.readyCallback = null;
};

x3dom.glTF.glTFLoader.prototype.getURL = function(url)
{
    if ( url.indexOf("http://") == -1 )
    {
        url = this.baseURL + url;
    }
    
    return url;
};


x3dom.glTF.glTFLoader.prototype.load = function(response, callback)
{
    this.header = this.readHeader(response);

    if ( this.encoding == "binary" && this.header.sceneLength > 0 )
    {
        this.scene = this.readScene(response, this.header);
        this.body = this.readBody(response, this.header);
        callback();
    }
    else
    {
        this.readyCallback = callback;
        this.scene = this.readScene(response, this.header);
        this.loadExternalStuff();
    }
};

x3dom.glTF.glTFLoader.prototype.loadExternalStuff = function(callback)
{
    switch( this.state )
    {
        case 0: this.state++; this.loadBuffers(); break;
        case 1: this.state++; this.loadImages(); break;
        case 2: this.state++; this.loadShaders(); break;
        default: this.readyCallback();
    }
};

x3dom.glTF.glTFLoader.prototype.getScene = function(shape,shaderProgram, gl, sceneName)
{
    this.reset(shape,gl);

    if(sceneName == null)
    {
        sceneName = this.scene["scene"];
    }
    
    if(sceneName == null)
    {
        sceneName = Object.keys(this.scene.scenes)[0];
    }
    
    var scene = this.scene.scenes[sceneName];

    this.updateScene(shape, shaderProgram, gl, scene);
};

x3dom.glTF.glTFLoader.prototype.getMesh = function(shape,shaderProgram, gl, meshName)
{
    this.reset(shape,gl);

    var mesh;
    if(meshName == null)
    {
        mesh = Object.keys(this.scene.meshes)[0];
    }else
    {
        for(var key in this.scene.meshes){
            if(this.scene.meshes.hasOwnProperty(key)
                && key == meshName)
            {
                mesh = this.scene.meshes[key];
                break;
            }
        }
    }
    this.updateMesh(shape, shaderProgram, gl, mesh, new x3dom.fields.SFMatrix4f());
};

x3dom.glTF.glTFLoader.prototype.reset = function(shape, gl)
{
    this._mesh._numCoords = 0;
    this._mesh._numFaces = 0;

    shape._webgl.externalGeometry = -1;

    if(this.loaded.bufferViews==null)
        this.loaded.bufferViews = this.loadBufferViews(shape, gl);
};

x3dom.glTF.glTFLoader.prototype.updateScene = function(shape, shaderProgram, gl, scene)
{
    var nodes = scene["nodes"];

    for(var i = 0; i<nodes.length;++i)
    {
        var nodeID = nodes[i];
        var worldTransform = new x3dom.fields.SFMatrix4f(); // identity
        this.traverseNode(shape, shaderProgram, gl, this.scene.nodes[nodeID], worldTransform);
    }
};


x3dom.glTF.glTFLoader.prototype.traverseNode = function(shape, shaderProgram, gl, node, transform)
{
    var worldTransform = transform.mult(this.getTransform(node));
    var children = node["children"];
    if(children != null)
        for(var i = 0; i<children.length;++i)
        {
            var childID = children[i];
            this.traverseNode(shape, shaderProgram, gl, this.scene.nodes[childID], worldTransform);
        }

    var meshes = null;
    
    if ( node["meshes"] && node["meshes"].length > 0)
    {
        meshes = node["meshes"]
    }
    else if ( node["mesh"] != undefined )
    {
        meshes = [ node["mesh"] ];
    }
        
    if( meshes != null )
    {
        for (var i = 0; i < meshes.length; ++i) {
            var meshID = meshes[i];
            //if (this.loaded.meshes[meshID] == null)
            {
                this.updateMesh(shape, shaderProgram, gl, this.scene.meshes[meshID], worldTransform);
                this.loaded.meshes[meshID] = 1;
            }
        }
    }
};


x3dom.glTF.glTFLoader.prototype.getTransform = function (node) {
    var transform = new x3dom.fields.SFMatrix4f();// start with identity
    if ( node.matrix ) {
        transform.setFromArray(node.matrix);
        return transform;
    }
    if ( node.scale && node.scale.length == 3) {
        var s = node.scale;
        transform.setScale(new x3dom.fields.SFVec3f(s[0], s[1], s[2]));
    }
    if ( node.rotation && node.rotation.length == 4) {
        var r = node.rotation;
        var rotationMatrix = new x3dom.fields.SFMatrix4f();
        rotationMatrix.setRotate(
            new x3dom.fields.Quaternion(r[0], r[1], r[2], r[3]));
        transform = rotationMatrix.mult(transform);
    }
    if ( node.translation && node.translation.length == 3 ) {
        var t = node.translation;
        var translationMatrix = x3dom.fields.SFMatrix4f.translation(
            new x3dom.fields.SFVec3f(t[0], t[1], t[2]));
        transform = translationMatrix.mult(transform);
    }
    return transform;
};

x3dom.glTF.glTFLoader.prototype.updateMesh = function(shape, shaderProgram, gl, mesh, worldTransform)
{
    var primitives = mesh["primitives"];
    for(var i = 0; i<primitives.length; ++i){
        this.loadglTFMesh(shape, shaderProgram, gl, primitives[i], worldTransform);
    }
};

x3dom.glTF.glTFLoader.prototype.loadPrimitive =  function(shape, shaderProgram, gl, primitive)
{
    var INDEX_BUFFER_IDX    = 0;
    var POSITION_BUFFER_IDX = 1;
    var NORMAL_BUFFER_IDX   = 2;
    var TEXCOORD_BUFFER_IDX = 3;
    var COLOR_BUFFER_IDX    = 4;
    var TANGENT_BUFFER_IDX  = 6;
    var BITANGENT_BUFFER_IDX  = 7;

    var x3domTypeID, x3domShortTypeID;

    var meshIdx = this.loaded.meshCount;
    var bufferOffset = meshIdx * 6;
    shape._webgl.primType[meshIdx] = primitive["mode"];

    var indexed = (primitive.indices != null && primitive.indices != "");

    if(indexed == true){
        var indicesAccessor = this.scene.accessors[primitive.indices];

        shape._webgl.indexOffset[meshIdx] = indicesAccessor["byteOffset"];
        shape._webgl.drawCount[meshIdx]   = indicesAccessor["count"];

        shape._webgl.buffers[INDEX_BUFFER_IDX + bufferOffset] =
            this.loaded.bufferViews[indicesAccessor["bufferView"]];

        //TODO: add support for LINES and POINTS
        this._mesh._numFaces += indicesAccessor["count"] / 3;
    }

    var attributes = primitive["attributes"];

    for (var attributeID in attributes)
    {
        var accessorName = attributes[attributeID];
        var accessor = this.scene.accessors[accessorName];

        var bufferView = this.scene.bufferViews[ accessor.bufferView ];

        var byteOffset = accessor.byteOffset + bufferView.byteOffset;
        var byteLength = accessor.count * LUX.Utils.componentsOf(accessor.type.toLowerCase());

        console.log(accessor.type);

        var data = new Uint8Array(this.buffers[bufferView.buffer], byteOffset, byteLength);

        var newBuffer = gl.createBuffer();
        gl.bindBuffer(bufferView["target"], newBuffer);

        //upload all chunk data to GPU
        gl.bufferData(bufferView["target"], data, gl.STATIC_DRAW);

        gl.bindBuffer(bufferView["target"], null);

        //the current renderer does not support generic vertex attributes, so simply look for useable cases
        switch (attributeID)
        {
            case "POSITION":
                x3domTypeID      = "coord";
                x3domShortTypeID = "Pos";
                shape._webgl.buffers[POSITION_BUFFER_IDX + bufferOffset] = newBuffer;
                //for non-indexed rendering, we assume that all attributes have the same count
                if (indexed == false)
                {
                    shape._webgl.drawCount[meshIdx] = accessor["count"];
                    //TODO: add support for LINES and POINTS
                    this._mesh._numFaces += accessor["count"] / 3;
                }
                this._mesh._numCoords += accessor["count"];
                break;

            case "NORMAL":
                x3domTypeID      = "normal";
                x3domShortTypeID = "Norm";
                shape._webgl.buffers[NORMAL_BUFFER_IDX + bufferOffset] = newBuffer;
                break;

            case "TEXCOORD_0":
                x3domTypeID      = "texCoord";
                x3domShortTypeID = "Tex";
                shape._webgl.buffers[TEXCOORD_BUFFER_IDX + bufferOffset] = newBuffer;
                break;

            case "COLOR":
                x3domTypeID      = "color";
                x3domShortTypeID = "Col";
                shape._webgl.buffers[COLOR_BUFFER_IDX + bufferOffset] = newBuffer;
                break;

            case "TANGENT":
                x3domTypeID      = "tangent";
                x3domShortTypeID = "Tangent";
                shape._webgl.buffers[TANGENT_BUFFER_IDX + bufferOffset] = newBuffer;
                break;

            case "BITANGENT":
                x3domTypeID      = "binormal";
                x3domShortTypeID = "Binormal";
                shape._webgl.buffers[BITANGENT_BUFFER_IDX + bufferOffset] = newBuffer;
                break;
        }

        if(x3domTypeID != null){
            shape["_" + x3domTypeID + "StrideOffset"][meshIdx] = [];

            shape["_" + x3domTypeID + "StrideOffset"][meshIdx][0] = accessor["byteStride"];
            shape["_" + x3domTypeID + "StrideOffset"][meshIdx][1] = accessor["byteOffset"];
            shape._webgl[x3domTypeID + "Type"]           = accessor["componentType"];

            this._mesh["_num" + x3domShortTypeID + "Components"] = this.getNumComponentsForType(accessor["type"]);
        }
    }

    this.loaded.meshCount += 1;

    shape._dirty.shader = true;
    shape._nameSpace.doc.needRender = true;
    x3dom.BinaryContainerLoader.checkError(gl);
};

x3dom.glTF.glTFLoader.prototype.loadglTFMesh =  function(shape, shaderProgram, gl, primitive, worldTransform)
{
    "use strict";

    var mesh = new x3dom.glTF.glTFMesh();

    mesh.primitiveType = primitive["mode"] || gl.TRIANGLES;
    
    mesh.transform = worldTransform;

    var indexed = (primitive.indices != null && primitive.indices != "");

    if(indexed == true){
        var indicesAccessor = this.scene.accessors[primitive.indices];

        mesh.buffers[glTF_BUFFER_IDX.INDEX] = {};
        mesh.buffers[glTF_BUFFER_IDX.INDEX].offset = indicesAccessor["byteOffset"];
        mesh.buffers[glTF_BUFFER_IDX.INDEX].type =  indicesAccessor["componentType"];
        mesh.buffers[glTF_BUFFER_IDX.INDEX].idx = this.loaded.bufferViews[indicesAccessor["bufferView"]];

        mesh.drawCount = indicesAccessor["count"];
        this._mesh._numFaces += indicesAccessor["count"] / 3;
    }

    var attributes = primitive["attributes"];

    for (var attributeID in attributes)
    {
        var accessorName = attributes[attributeID];
        var accessor = this.scene.accessors[accessorName];

        var idx = null;

        //the current renderer does not support generic vertex attributes, so simply look for useable cases
        switch (attributeID)
        {
            case "POSITION":
                idx = glTF_BUFFER_IDX.POSITION;

                //for non-indexed rendering, we assume that all attributes have the same count
                if (indexed == false)
                {
                    mesh.drawCount = accessor["count"];
                    this._mesh._numFaces += accessor["count"] / 3;
                }
                this._mesh._numCoords += accessor["count"];
                                
                var min = new x3dom.fields.SFVec3f(accessor["min"][0],accessor["min"][1],accessor["min"][2]);
                var max = new x3dom.fields.SFVec3f(accessor["max"][0],accessor["max"][1],accessor["max"][2]);
                
                this._mesh._vol = new x3dom.fields.BoxVolume();
                
                this._mesh._vol.setBounds(min, max);
                break;

            case "NORMAL":
                idx = glTF_BUFFER_IDX.NORMAL;
                break;

            case "TEXCOORD_0":
                idx = glTF_BUFFER_IDX.TEXCOORD;
                break;

            case "COLOR":
                idx = glTF_BUFFER_IDX.COLOR;
                break;

            case "TANGENT":
                idx = glTF_BUFFER_IDX.TANGENT;
                break;

            case "BITANGENT":
                idx = glTF_BUFFER_IDX.BITANGENT;
                break;
        }

        if(idx != null){
            mesh.buffers[idx] = {};
            mesh.buffers[idx].idx = this.loaded.bufferViews[accessor["bufferView"]];
            mesh.buffers[idx].offset = accessor["byteOffset"];
            mesh.buffers[idx].stride = accessor["byteStride"];

            mesh.buffers[idx].type = accessor["componentType"];
            mesh.buffers[idx].numComponents = this.getNumComponentsForType(accessor["type"]);
        }
    }

    this.loaded.meshCount += 1;

    shape._dirty.shader = true;
    shape._nameSpace.doc.needRender = true;
    x3dom.BinaryContainerLoader.checkError(gl);

    if(primitive.material != null && !this.meshOnly) {
        mesh.material = this.loadMaterial(gl, this.scene.materials[primitive.material]);
        mesh.material.worldTransform = worldTransform;
    }

    if(shape.meshes == null)
        shape.meshes = [];
    shape.meshes.push(mesh);
};

x3dom.glTF.glTFLoader.prototype.loadBufferViews = function(shape, gl)
{
    var buffers = {};

    var bufferViews = this.scene.bufferViews;
    for(var bufferViewId in bufferViews)
    {
        if(!bufferViews.hasOwnProperty(bufferViewId)) continue;

        var bufferView = bufferViews[bufferViewId];

        // do not use Buffer for Skin or animation data
        if(bufferView.target == null && bufferView.target != gl.ARRAY_BUFFER && bufferView.target != gl.ELEMENT_ARRAY_BUFFER)
            continue;

        shape._webgl.externalGeometry = 1;

        if ( this.encoding == "binary" )
        {
            var data = new Uint8Array(this.body.buffer,
            this.header.bodyOffset + bufferView["byteOffset"],
            bufferView["byteLength"]);

            var newBuffer = gl.createBuffer();
            gl.bindBuffer(bufferView["target"], newBuffer);

            //upload all chunk data to GPU
            gl.bufferData(bufferView["target"], data, gl.STATIC_DRAW);

            buffers[bufferViewId] = newBuffer;
        }
        else
        {
            var data = new Uint8Array(this.buffers[bufferView.buffer], bufferView["byteOffset"], bufferView["byteLength"]);
            
            var newBuffer = gl.createBuffer();
            gl.bindBuffer(bufferView["target"], newBuffer);

            //upload all chunk data to GPU
            gl.bufferData(bufferView["target"], data, gl.STATIC_DRAW);

            buffers[bufferViewId] = newBuffer;
        }
    }

    return buffers;
};

x3dom.glTF.glTFLoader.prototype.loadBufferView = function(primitive, attribute, gl)
{
    var accessor = this.scene.accessors[ attribute ];
    var bufferView = this.scene.bufferViews[ accessor.bufferView ];

    var byteOffset = accessor.byteOffset + bufferView.byteOffset;
    var byteLength = accessor.count * LUX.Utils.componentsOf(accessor.type.toLowerCase());

    var data = new Uint8Array(this.buffers[bufferView.buffer], bufferView["byteOffset"], bufferView["byteLength"]);

    var newBuffer = gl.createBuffer();
    gl.bindBuffer(bufferView["target"], newBuffer);

    //upload all chunk data to GPU
    gl.bufferData(bufferView["target"], data, gl.STATIC_DRAW);

    buffers[bufferViewId] = newBuffer;
};

x3dom.glTF.glTFLoader.prototype.readHeader = function(response)
{
    var header = {};
    
    if ( this.encoding == "binary" )
    {
        var magicBytes = new Uint8Array(response, 0, 4);
        var versionBytes = new Uint32Array(response, 4, 1);
        var lengthBytes = new Uint32Array(response, 8, 1);
        var sceneLengthBytes = new Uint32Array(response, 12, 1);
        var sceneFormatBytes = new Uint32Array(response, 16, 1);

        header.magic = x3dom.Utils.ArrayToStr(magicBytes);
        
        if(versionBytes[0] == 1)
        {
            header.version = "Version 1";
        }
        
        header.length = lengthBytes[0];
        header.sceneLength = sceneLengthBytes[0];

        if(sceneFormatBytes[0] == 0)
        {
            header.sceneFormat = "JSON";
        }

        header.bodyOffset = header.sceneLength + 20;
    }
    else if ( this.encoding == "ascii" )
    {
        header.version = response.asset.version;
        header.length = 0;
        header.sceneLength = 1;
        header.bodyOffset = 0;
        header.sceneFormat = "JSON";
    }
    

    return header;
};

x3dom.glTF.glTFLoader.prototype.readScene = function(response,header)
{
    var scene = null;
    
    if ( this.encoding == "binary" )
    {
        var sceneBytes = new Uint8Array(response, 20, header.sceneLength);

        scene = JSON.parse(x3dom.Utils.ArrayToStr(sceneBytes));
    }
    else if ( this.encoding == "ascii" )
    {
        scene = response;
    }

    return scene;
};

x3dom.glTF.glTFLoader.prototype.readBody = function(response, header)
{
    var offset = header.sceneLength + 20;
    var body = new Uint8Array(response, offset, header.length-offset);

    return body;
};

x3dom.glTF.glTFLoader.prototype.loadBuffers = function()
{
    var buffers = this.scene.buffers;
    
    if ( buffers )
    {    
        var numBuffers = Object.keys(buffers).length;
        
        var numLoadedBuffers = 0;
        
        for ( var bufferID in buffers )
        {
            var buffer = buffers[ bufferID ];
            
            var xhr = new XMLHttpRequest();
            
            xhr.responseType = "arraybuffer";
            
            xhr.bufferID = bufferID;
            
            xhr.open( "GET", this.getURL( buffer.uri ) );
            
            xhr.addEventListener( "load", function ( e )
            {
                numLoadedBuffers++;
                
                this.buffers[ e.target.bufferID ] = e.target.response;
                
                if ( numLoadedBuffers == numBuffers )
                {
                    this.loadExternalStuff();
                }
            }.bind(this) );
            
            xhr.addEventListener( "error", function ()
            {
                this.loadExternalStuff();
            }.bind(this) );
            
            x3dom.RequestManager.addRequest(xhr);
        }
    }
    else
    {
        this.loadExternalStuff();
    }
};

x3dom.glTF.glTFLoader.prototype.loadShaders = function()
{
    var shaders = this.scene.shaders;
    
    if ( shaders )
    {
        var numShaders = Object.keys(shaders).length;
        
        var numLoadedShaders = 0;
        
        for ( var shaderID in shaders )
        {
            var shader = shaders[ shaderID ];
            
            var xhr = new XMLHttpRequest();
            
            xhr.responseType = "text";
            
            xhr.shaderID = shaderID;
            
            xhr.open( "GET", this.getURL( shader.uri ) );
            
            xhr.addEventListener( "load", function ( e )
            {
                numLoadedShaders++;
                
                this.loaded.shaders[ e.target.shaderID ] = e.target.response;
                
                if ( numLoadedShaders == numShaders )
                {
                    this.loadExternalStuff();
                }
            }.bind(this) );
            
            xhr.addEventListener( "error", function ()
            {
                this.loadExternalStuff();
            }.bind(this) );
            
            x3dom.RequestManager.addRequest(xhr);
        }
    
    }
    else
    {
        this.loadExternalStuff();
    }
};

x3dom.glTF.glTFLoader.prototype.getNumComponentsForType = function(type)
{
    switch (type)
    {
        case "SCALAR": return 1;
        case "VEC2":   return 2;
        case "VEC3":   return 3;
        case "VEC4":   return 4;
        default:       return 0;
    }
};


x3dom.glTF.glTFLoader.prototype.loadImage = function(imageNodeName, mimeType)
{
    if(this.loaded.images == null)
        this.loaded.images = {};

    if(this.loaded.images[imageNodeName]!=null)
        return this.loaded.images[imageNodeName];

    var imageNode = this.scene.images[imageNodeName];
    
    if(imageNode.extensions!=null && imageNode.extensions.KHR_binary_glTF != null)
    {
        var ext = imageNode.extensions.KHR_binary_glTF;
        var bufferView = this.scene.bufferViews[ext.bufferView];
        var uint8Array = new Uint8Array(this.body.buffer, this.header.bodyOffset + bufferView.byteOffset, bufferView.byteLength);

        var blob = new Blob([uint8Array], {
            type : ext.mimeType
        });
        var blobUrl = window.URL.createObjectURL(blob);

        var image = new Image();

        image.src = blobUrl;

        this.loaded.images[imageNodeName] = image;

        return image;
    }

    return null;
};

x3dom.glTF.glTFLoader.prototype.loadImages = function( callback )
{
    var images = this.scene.images;
        
    if( images )
    {
        var numImages = Object.keys(images).length;
        var numLoadedImages = 0;
        
        for (var imageID in images )
        {           
            var image = images[ imageID ];
            
            if ( image.uri )
            {
                var img = new Image();
                
                img.src = this.getURL( image.uri );
                
                img.imageID = imageID;
                
                img.addEventListener( "load", function( e )
                {
                    numLoadedImages++;
                    
                    this.loaded.images[e.target.imageID] = e.target;
                    
                    if(numLoadedImages == numImages)
                    {
                        this.loadExternalStuff();
                    }
                }.bind(this));
            }
        }
    }
    else
    {
        this.loadExternalStuff();
    }
}

x3dom.glTF.glTFLoader.prototype.loadTexture = function(gl, textureNodeName)
{
    if(this.loaded.textures == null)
        this.loaded.textures = {};

    if(this.loaded.textures[textureNodeName]!=null)
        return this.loaded.textures[textureNodeName];

    var textureNode = this.scene.textures[textureNodeName];

    //Defaults
    textureNode["target"] = textureNode["target"] || 3553;
    textureNode["internalFormat"] = textureNode["internalFormat"] || 6408;
    textureNode["format"] = textureNode["format"] || 6408;
    textureNode["type"] = textureNode["type"] || 5121;

    var format = textureNode.format;
    var internalFormat = textureNode.internalFormat;

    var sampler = {
        "magFilter": 9729,
        "minFilter": 9987,
        "wrapS": 33648,
        "wrapT": 33648
    };

    var samplerNode = this.scene.samplers[textureNode.sampler];
    if(samplerNode!=null)
    {
        for(var key in samplerNode){
            if(samplerNode.hasOwnProperty(key))
                sampler[key] = samplerNode[key];
        }
    }

    var image = this.loadImage(textureNode.source);
    var target = textureNode.target;
    var type = textureNode.type;
    
    var flipY = (this.header.version != "1.0")
    
    var glTFTexture = new x3dom.glTF.glTFTexture(gl, format, internalFormat, sampler, target, type, image, flipY);

    this.loaded.textures[textureNodeName] = glTFTexture;

    return glTFTexture;
};

x3dom.glTF.glTFLoader.prototype.loadMaterial = function(gl, materialNode)
{
    if(materialNode){
        if(materialNode.extensions != null && materialNode.extensions.KHR_materials_common != null)
        {
            materialNode = materialNode.extensions.KHR_materials_common;

            var material = new x3dom.glTF.glTFKHRMaterialCommons();

            material.technique = glTF_KHR_MATERIAL_COMMON_TECHNIQUE[materialNode.technique];
            material.doubleSided = materialNode.doubleSided;

            for(var key in materialNode.values)
                if(materialNode.values.hasOwnProperty(key))
                {
                    var value = materialNode.values[key];
                    if(typeof value === 'string')
                    {
                        material[key+"Tex"] = this.loadTexture(gl, value);
                    }
                    else
                    {
                        material[key] = value;
                    }
                }

            return material;
        }
        else if(materialNode.technique)
        {
            var technique = this.scene.techniques[materialNode.technique];
            var program = this.loadShaderProgram(gl, technique.program);

            var material = new x3dom.glTF.glTFMaterial(technique);
            material.program = program;

            for(var key in technique.parameters) {
                if (!technique.parameters.hasOwnProperty(key)) continue;

                var parameter = technique.parameters[key];
                if(parameter.value != null){
                    
                    switch(parameter.type)
                    {
                        case gl.SAMPLER_2D:
                            material.textures[key] = this.loadTexture(gl, parameter.value[0]);
                            break;
                        default:
                            material.values[key] = parameter.value;
                    } 
                }
            }

            for(var key in materialNode.values)
                if(materialNode.values.hasOwnProperty(key))
                {
                    var value = materialNode.values[key];
                    if(typeof value === 'string')
                    {
                        material.textures[key] = this.loadTexture(gl, value);
                    }
                    else
                    {
                        material.values[key] = value;
                    }
                }

            return material;
        }
        else if(materialNode.pbrMetallicRoughness)
        {
            var material = new x3dom.glTF.PBRMaterial();

            if(materialNode.normalTexture)
            {
                material.normalTex = this.loadTexture(gl, materialNode.normalTexture.index);
            }

            if(materialNode.pbrMetallicRoughness.baseColorTexture)
            {
                material.baseColorTex = this.loadTexture(gl, materialNode.pbrMetallicRoughness.baseColorTexture.index);
            }

            return material;
        }
    }

    return new x3dom.glTF.glTFKHRMaterialCommons();
};

x3dom.glTF.glTFLoader.prototype.loadShaderProgram = function(gl, shaderProgramName)
{
    if(this.loaded.programs == null)
        this.loaded.programs = {};

    if(this.loaded.programs[shaderProgramName] != null)
        return this.loaded.programs[shaderProgramName];

    var shaderProgramNode = this.scene.programs[shaderProgramName];

    var vertexShaderNode = this.scene.shaders[shaderProgramNode.vertexShader];    
    var vertexShaderSrc = this.loaded.shaders[shaderProgramNode.vertexShader] || this._loadShaderSource(vertexShaderNode);

    var fragmentShaderNode = this.scene.shaders[shaderProgramNode.fragmentShader];
    var fragmentShaderSrc = this.loaded.shaders[shaderProgramNode.fragmentShader] || this._loadShaderSource(fragmentShaderNode);

    var program = gl.createProgram();

    var vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertexShader, vertexShaderSrc);
    gl.compileShader(vertexShader);

    if(!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)){
        x3dom.debug.logError("[glTF binary] VertexShader " + gl.getShaderInfoLog(vertexShader));
    }

    var fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragmentShader, fragmentShaderSrc);
    gl.compileShader(fragmentShader);

    if(!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)){
        x3dom.debug.logError("[glTF binary] FragmentShader " + gl.getShaderInfoLog(fragmentShader));
    }

    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);

    // optional, but position should be at location 0 for performance reasons
    gl.bindAttribLocation(program, 0, "position");

    gl.linkProgram(program);

    var program = x3dom.Utils.wrapProgram(gl, program);

    this.loaded.programs[shaderProgramName] = program;

    return program;
};

x3dom.glTF.glTFLoader.prototype._loadShaderSource = function(shaderNode)
{
    var bufferView = this.scene.bufferViews[shaderNode.extensions.KHR_binary_glTF.bufferView];

    var shaderBytes = new Uint8Array(this.body.buffer, this.header.bodyOffset+bufferView.byteOffset, bufferView.byteLength);
    var src = x3dom.Utils.ArrayToStr(shaderBytes);
    return src;
};
