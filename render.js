import * as THREE from 'three';
import {VRButton} from 'three/addons/webxr/VRButton.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import {RGBELoader} from "three/examples/jsm/loaders/RGBELoader";
// import {PMREMGenerator} from "three/src/extras/PMREMGenerator";
// var EquirectangularToCubemap = require( 'three.equirectangular-to-cubemap' );
import { Vector3 } from 'three/src/math/Vector3.js';
import { Vector2 } from 'three/src/math/Vector2.js';
import { Float32BufferAttribute } from 'three/src/core/BufferAttribute.js';
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer"
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass";
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera( 14, window.innerWidth / window.innerHeight, 0.1, 1000 );
camera.position.set(0, 1.6, 0);

var CANVAS = document.getElementById("canvas_id");
const renderer = new THREE.WebGLRenderer( { canvas: CANVAS } );
renderer.xr.enabled = true;
//document.body.appendChild(VRButton.createButton(renderer));
renderer.setSize( CANVAS.clientWidth, CANVAS.clientHeight );
//document.body.appendChild( renderer.domElement );

function resizeRendererToDisplaySize(renderer) {
  const canvas = renderer.domElement;
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const needResize = canvas.width !== width || canvas.height !== height;
  if (needResize) {
    renderer.setSize(width, height, false);
  }
  return needResize;
}


const bloom = false;

const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 4, 1, 2.5);
const composer = new EffectComposer(renderer);
const renderPass = new RenderPass(scene, camera);

if (bloom) {
  composer.addPass(renderPass);
  composer.addPass(bloomPass);
}

var hilt;
var blade;


THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }',
  `vec3 CustomToneMapping(vec3 color) {
     color += vec3(dot(max(color - vec3(1), vec3(0)), vec3(0.33)));
     return color;
   }`
);

renderer.toneMapping = THREE.CustomToneMapping;

class BladeGeometry extends THREE.BufferGeometry {

  constructor( radiusTop = 1, radiusBottom = 1, height = 1, radialSegments = 32, heightSegments = 1, openEnded = false, thetaStart = 0, thetaLength = Math.PI * 2 ) {

    super();

    this.type = 'CylinderGeometry';

    this.parameters = {
      radiusTop: radiusTop,
      radiusBottom: radiusBottom,
      height: height,
      radialSegments: radialSegments,
      heightSegments: heightSegments,
      openEnded: openEnded,
      thetaStart: thetaStart,
      thetaLength: thetaLength
    };

    const scope = this;

    radialSegments = Math.floor( radialSegments );
    heightSegments = Math.floor( heightSegments );

    // buffers
    const indices = [];
    const vertices = [];
    const normals = [];
    const uvs = [];

    // helper variables
    let index = 0;
    const indexArray = [];
    const halfHeight = height / 2;
    let groupStart = 0;

    // generate geometry
    generateTorso();

    if ( openEnded === false ) {
      if ( radiusTop > 0 ) generateCap( true );
      if ( radiusBottom > 0 ) generateCap( false );
    }

    // build geometry
    this.setIndex( indices );
    this.setAttribute( 'position', new Float32BufferAttribute( vertices, 3 ) );
    this.setAttribute( 'normal', new Float32BufferAttribute( normals, 3 ) );
    this.setAttribute( 'uv', new Float32BufferAttribute( uvs, 2 ) );

    function generateTorso() {

      const normal = new Vector3();
      const vertex = new Vector3();

      let groupCount = 0;

      // this will be used to calculate the normal
      const slope = ( radiusBottom - radiusTop ) / height;

      // generate vertices, normals and uvs

      for ( let y = 0; y <= heightSegments; y ++ ) {

        const indexRow = [];

        const v = y / heightSegments;

        // calculate the radius of the current row

        const radius = v * ( radiusBottom - radiusTop ) + radiusTop;

        for ( let x = 0; x < radialSegments; x ++ ) {
          const u = x / radialSegments;

          const theta = u * thetaLength + thetaStart;

          const sinTheta = Math.sin( theta );
          const cosTheta = Math.cos( theta );

          // vertex
          vertex.x = radius * sinTheta;
          vertex.y = - v * height + halfHeight;
          vertex.z = radius * cosTheta;
          vertices.push( vertex.x, vertex.y, vertex.z );

          // normal
          normal.set( sinTheta, slope, cosTheta ).normalize();
          normals.push( normal.x, normal.y, normal.z );

          // uv
          uvs.push( 0.5,  1 - v );

          // save index of vertex in respective row
          indexRow.push( index ++ );
        }
        indexRow.push(indexRow[0]);

        // now save vertices of the row in our index array
        indexArray.push( indexRow );
      }

      // generate indices
      for ( let x = 0; x < radialSegments; x ++ ) {
        for ( let y = 0; y < heightSegments; y ++ ) {

          // we use the index array to access the correct indices
          const a = indexArray[ y ][ x ];
          const b = indexArray[ y + 1 ][ x ];
          const c = indexArray[ y + 1 ][ x + 1 ];
          const d = indexArray[ y ][ x + 1 ];

          // faces
          if ( radiusTop > 0 || y !== 0 ) {
            indices.push( a, b, d );
            groupCount += 3;
          }

          if ( radiusBottom > 0 || y !== heightSegments - 1 ) {
            indices.push( b, c, d );
            groupCount += 3;
          }
        }
      }

      // add a group to the geometry. this will ensure multi material support
      scope.addGroup( groupStart, groupCount, 0 );

      // calculate new start value for groups
      groupStart += groupCount;
    }

    function generateCap( top ) {
      const normal = new Vector3();

      // save the index of the first center vertex
      const centerIndexStart = index;

      const uv = new Vector2();
      const vertex = new Vector3();

      let groupCount = 0;

      const radius = ( top === true ) ? radiusTop : radiusBottom;
      const sign = ( top === true ) ? 1 : - 1;

      const capIndex = [];
      capIndex.push( indexArray[ top ? 0 : heightSegments] )
      const segments = Math.floor(radialSegments / 4);

      for (let y = 1; y < segments; y++) {
        const indexRow = [];
        const angle = y * Math.PI / 2 / segments;
        const sinAngle = Math.sin( angle );
        const cosAngle = Math.cos( angle );

        for ( let x = 0; x < radialSegments; x ++ ) {
          const u = x / radialSegments;
          const theta = u * thetaLength + thetaStart;
          const sinTheta = Math.sin( theta );
          const cosTheta = Math.cos( theta );

          vertex.x = radius * sinTheta * cosAngle;
          vertex.y = (halfHeight + sinAngle * radius) * sign;
          vertex.z = radius * cosTheta * cosAngle;
          vertices.push( vertex.x, vertex.y, vertex.z );

          normal.set(sinTheta * cosAngle, sinAngle, cosTheta * cosAngle).normalize();
          normals.push(normal.x, normal.y, normal.z);

          uvs.push(0.5, top ? 1.0 : 0.0);

          indexRow.push(index++);
        }

        indexRow.push(indexRow[0]);
        capIndex.push(indexRow);
      }

      vertices.push(0, (halfHeight + radius) * sign, 0);
      normals.push(0, sign, 0);
      uvs.push(0.5, top ? 1.0 : 0.0);
      const indexRow = [];
      for ( let x = 0; x <= radialSegments; x ++ ) indexRow.push(index);
      index++;
      capIndex.push(indexRow);

      for (let y = 0; y < segments; y++) {
        for (let x = 0; x < radialSegments; x++) {
          const a = capIndex[y][x];
          const b = capIndex[y + 1][x];
          const c = capIndex[y + 1][x + 1];
          const d = capIndex[y][x + 1];

          if (top) {
            indices.push(d, b, a);
          } else {
            indices.push(a, b, d);
          }
          groupCount += 3;

          if (y !== segments - 1) {
            if (top) {
              indices.push(d, c, b);
            } else {
              indices.push(b, c, d);
            }
            groupCount += 3;
          }
        }
      }

      // add a group to the geometry. this will ensure multi material support
      scope.addGroup( groupStart, groupCount, top === true ? 1 : 2 );

      // calculate new start value for groups
      groupStart += groupCount;
    }
  }

  copy( source ) {
    super.copy( source );
    this.parameters = Object.assign( {}, source.parameters );
    return this;
  }

  static fromJSON( data ) {
    return new BladeGeometry( data.radiusTop, data.radiusBottom, data.height, data.radialSegments, data.heightSegments, data.openEnded, data.thetaStart, data.thetaLength );
  }
};

//
// Halo
//
const bladeHaloVertexShader = `
  varying vec3   vA;
  varying vec3   vB;
  varying vec3   vTarget;

  vec3 PD(vec4 p) { return p.xyz; }

  void main() {
    vA          = PD(viewMatrix * modelMatrix * vec4(  0.0, -75.0, 0.0, 1.0));
    vB          = PD(viewMatrix * modelMatrix * vec4(  0.0,  35.0, 0.0, 1.0));
    vTarget     = PD(viewMatrix * modelMatrix * vec4(position,     1.0));
    gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position, 1.0);
  }
`;

const bladeHaloFragmentShader = `
  varying vec3        vA;
  varying vec3        vB;
  varying vec3        vTarget;
  uniform sampler2D   iChannel0;

  float line_dist(vec3 pt1, vec3 dir1, vec3 pt2, vec3 dir2) {
    vec3 n = normalize(cross(dir1, dir2));
    return abs(dot(n, pt1 - pt2));
  }

  struct Ray   { vec3 start, dir; };
  struct Plane { vec3 pos, normal; };
  struct Range { float begin, end; };

  #define NOHIT 1000.0
  float FAR()          { return NOHIT; }
  float NEAR()         { return 0.0; }
  Range Everything()   { return Range(NEAR(), FAR()); }
  Range Nothing()      { return Range(FAR(), NEAR()); }
  float Max(float a, float b) { return max(a, b); }
  float Min(float a, float b) { return min(a, b); }
  bool  Empty(Range a)          { return a.begin >= a.end; }

  Range Intersect(Range a, Range b) {
    if (Empty(a)) return Nothing();
    if (Empty(b)) return Nothing();
    Range ret = Range(Max(a.begin, b.begin), Min(a.end, b.end));
    if (Empty(ret)) return Nothing();
    return ret;
  }

  Range Trace(Ray ray, Plane o) {
    vec3 pos    = o.pos;
    vec3 normal = o.normal;
    float tmp   = dot(pos - ray.start, normal);
    float div   = dot(ray.dir,    normal);
    if (div == 0.0) {
      if (tmp > 0.0) return Everything();
      else            return Nothing();
    }
    float dist = tmp / div;
    if (div > 0.0) return Range(NEAR(), dist);
    else           return Range(dist, FAR());
  }

  float blade_dist(vec3 pt1, vec3 dir1_un) {
    vec3 dir1 = normalize(dir1_un);
    vec3 pt2   = vA;
    vec3 dir2  = vB - vA;
    vec3 n     = normalize(cross(dir1, dir2));
    vec3 Q     = normalize(cross(n, dir1));
    float p    = clamp(Trace(Ray(vA, dir2), Plane(pt1, Q)).end, 0.0, 1.0);
    vec3 bp    = pt2 + dir2 * p;
    float q    = dot(bp - pt1, dir1);
    vec3 rp    = pt1 + dir1 * q;
    return length(bp - rp);
  }

  float get_point(vec3 pt1, vec3 dir1_un) {
    vec3 dir1 = normalize(dir1_un);
    vec3 pt2   = vA;
    vec3 dir2  = vB - vA;
    vec3 n     = normalize(cross(dir1, dir2));
    vec3 Q     = normalize(cross(n, dir1));
    float p    = clamp(Trace(Ray(vA, dir2), Plane(pt1, Q)).end, 0.0, 1.0);
    return p;
  }

  void main() {
    vec3  eye       = vec3(0.0, 0.0, 0.0);
    vec3  dir       = vTarget - eye;
    float dist      = blade_dist(eye, dir);
    float flyby_pt  = get_point(eye, dir);
    float cosA      = length(cross(normalize(vB - vA), normalize(dir)));
    dist           /= 30.0;
    vec3  haze_color = texture2D(
      iChannel0,
      vec2(1.0 - flyby_pt, sqrt(dist) / 2.0 / cosA)
    ).rgb;
    // vec3 haze_color = texture2D(iChannel0, vec2(flyby_pt, 1.0)).rgb;
    haze_color    /= (dist * dist * dist * dist * 500.0 + 1.0);
    // haze_color *= 1.0 - sqrt(dist);

    gl_FragColor = vec4(haze_color, 1.0);
  }
`;


const max_haze_depth = 8;
const blade_data =  new Uint8Array(4 * 144);
const haze_data =  new Uint8Array(4 * 144 * max_haze_depth);
var blade_texture;
var haze_texture;

var loader = new RGBELoader().setPath('./');
loader.load('ostrich_road_2k.hdr', function(texture) {
  texture.mapping = THREE.EquirectangularReflectionMapping;
  // scene.background = texture;
  var envMap = texture;
  const gltf_loader = new GLTFLoader();
  gltf_loader.load('obi/scene.gltf', function(gltf) {
    gltf.scene.traverse(function(child) {
      if (child.isMesh) {
        // console.log("MESH");
        child.material.envMap = envMap;
      }
    });

    scene.add(gltf.scene);
    hilt = gltf.scene;
    hilt.position.set(0, 1.6, -200);

    if (true) {
      // create a buffer with color data

      const width  = 1;
      const height = 144;
      const size   = width * height;

      blade_texture = new THREE.DataTexture(blade_data, width, height);
      blade_texture.colorSpace      = THREE.LinearSRGBColorSpace;
      blade_texture.generateMipmaps = false;
      blade_texture.magFilter       = THREE.LinearFilter;
      blade_texture.minFilter       = THREE.LinearFilter;
      blade_texture.needsUpdate     = true;

      haze_texture = new THREE.DataTexture(haze_data, height, max_haze_depth);
      haze_texture.colorSpace      = THREE.LinearSRGBColorSpace;
      haze_texture.generateMipmaps = false;
      haze_texture.magFilter       = THREE.LinearFilter;
      haze_texture.minFilter       = THREE.LinearFilter;
      haze_texture.needsUpdate     = true;

      const blade_translation = new THREE.Matrix4()
        .makeTranslation(0.0, -20.0, 0.0)
        .multiply(new THREE.Matrix4().makeRotationX(Math.PI));

      // const blade_geometry = new THREE.CapsuleGeometry(1.2, 80, 8, 64, 1);
      // const blade_geometry = new THREE.CylinderGeometry(1.2, 1.2, 80, 64, 1);
      const blade_geometry = new BladeGeometry(1.3, 1.3, 110, 64, 1);
      blade_geometry.applyMatrix4(blade_translation);

      // const blade_material = new THREE.MeshBasicMaterial({ color: 0xffffffff });
      const blade_material = new THREE.MeshStandardMaterial({
        color:             0xCCCCCC,
        emissiveMap:       blade_texture,
        emissiveIntensity: 1.7,
        emissive:          0xffffffff,
        envMap:            envMap
      });

      blade = new THREE.Mesh(blade_geometry, blade_material);
      hilt.add(blade);

      const blade_aura_geometry = new BladeGeometry(50, 50, 110, 16, 1);
      blade_aura_geometry.applyMatrix4(blade_translation);

      const blade_aura_material = new THREE.MeshStandardMaterial({
        color:             0x11111111,
        opacity:           0.1,
        transparent:       true,
        emissiveMap:       blade_texture,
        emissiveIntensity: 0.1,
        emissive:          0xffffffff,
        envMap:            envMap
      });

      const bladeHaloUniforms = {
        // iTime:       { value: 0 },
        // iResolution: { value: new THREE.Vector3(1, 1, 1) },
        iChannel0:     { value: haze_texture }
      };

      const blade_halo_material = new THREE.ShaderMaterial({
        vertexShader:   bladeHaloVertexShader,
        fragmentShader: bladeHaloFragmentShader,
        uniforms:       bladeHaloUniforms,
        transparent:    true,
        blending:       THREE.AdditiveBlending
      });

      var blade_aura = new THREE.Mesh(blade_aura_geometry, blade_halo_material);
      hilt.add(blade_aura);
    }
  }, undefined, function(error) {
    console.error(error);
  });
});



if (false) {
  const geometry = new THREE.BoxGeometry( 1, 1, 1 );
  const material = new THREE.MeshBasicMaterial( { color: 0x00ff00 } );
  const cube = new THREE.Mesh( geometry, material );
  scene.add( cube );
}

if (false) {
  const gltf_loader = new GLTFLoader();
  gltf_loader.load( 'public/obi/scene.gltf', function ( gltf ) {
    scene.add( gltf.scene );
  }, undefined, function ( error ) {
    console.error( error );
  } );
}

// camera.position.z = 200;

var Q = 0;

const start_millis = new Date().getTime();
function actual_millis() {
  return new Date().getTime() - start_millis;
}

function animate() {

  Q++;

  if (resizeRendererToDisplaySize(renderer)) {
    const canvas = renderer.domElement;
    camera.aspect = canvas.clientWidth / canvas.clientHeight;
    camera.updateProjectionMatrix();
  }

  if (blade_texture) {
    var pixels = window.getSaberColors();

    const m = actual_millis();
    for (let i = 0; i < 144; i++) {
      const stride        = i * 4;
      blade_data[stride    ] = Math.round(255 * pixels[i * 3    ]);
      blade_data[stride + 1] = Math.round(255 * pixels[i * 3 + 1]);
      blade_data[stride + 2] = Math.round(255 * pixels[i * 3 + 2]);
      blade_data[stride + 3] = 255;
    }
    blade_texture.needsUpdate = true;

    const num_leds = 144;
    for (var haze_depth = 0; haze_depth < max_haze_depth; haze_depth++) {
      for (var i = 0; i < num_leds; i++) {
        var R = 0.0;
        var G = 0.0;
        var B = 0.0;
        var W = 0.0;

        //        var haze_dist = 2.0 ** haze_depth;
        var haze_dist = 1.0 + 4.0 * haze_depth;
        for (var D = -64; D <= 64; D++) {
          var p    = i + D;
          var dist = Math.abs(D) + 1;
          if (p < 0) {
            continue;
            dist += -p / 2.0;
            p = 0;
          }
          if (p >= num_leds) {
            continue;
            dist += (p - (num_leds - 1)) / 2;
            p = num_leds - 1;
          }
          dist = dist / haze_dist + 1.0;
          var weight = 1.0 / (dist * dist);
          const stride3 = p * 3;
          R += pixels[stride3    ] * weight;
          G += pixels[stride3 + 1] * weight;
          B += pixels[stride3 + 2] * weight;
          W += weight;
        }
        //              W *= 2;
        R /= W;
        G /= W;
        B /= W;
        haze_data[(i + haze_depth * num_leds) * 4    ] = Math.round(R * 255);
        haze_data[(i + haze_depth * num_leds) * 4 + 1] = Math.round(G * 255);
        haze_data[(i + haze_depth * num_leds) * 4 + 2] = Math.round(B * 255);
        haze_data[i * 4 + 3] = 255;
      }
    }
    haze_texture.needsUpdate = true;
  }

  var mat = window.getSaberMove();
  if (hilt) {
    //        console.log(mat)
    hilt.rotation.z = 3.1415 / 2;
    //        hilt.rotation.x += 0.01;
    //        hilt.rotation.y += 0.007;
    //      hilt.rotation.z += 0.003;

    //        var m2 = new THREE.Matrix4();
    //        m2.fromArray(mat.values, 0);
    //        console.log(mat.values);
    //        hilt.applyMatrix4(m2);
    // hilt.matrix = m2;
    //        hilt.setRotationFromMatrix(m2);
    //        console.log(mat.values);
    //        console.log(hilt.matrix.elements);

    hilt.matrixAutoUpdate = false;
    hilt.matrix.fromArray(mat.values);
  }

  if (bloom) {
    composer.render();
  } else {
    renderer.render(scene, camera);
  }
}
renderer.setAnimationLoop( animate );
