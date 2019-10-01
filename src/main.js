//
// shaders
//
const basic_vert = `
precision highp float;

void main() {
    gl_Position = vec4( position, vec2(1.0) );
}
`;

const prep_frag = `
precision highp float;

void main() {
    gl_FragColor.z = 0.012;
}
`;

const physics_frag = `
precision highp float;

uniform vec3 mouse;
uniform vec3 pmouse;
uniform vec2 resolution;
uniform sampler2D texture;

float distToSegment( vec2 x1, vec2 x2, vec2 p ) {

  vec2 v = x2 - x1;
  vec2 w = p - x1;

  float c1 = dot(w,v);
  float c2 = dot(v,v);

  // if c2 <= c1 == c1
  // if c2 >  c1 == c2
  float div = mix( c2, c1, step( c2, c1 ) );

  // if c1 < 0 == 0.0
  float mult = step( 0.0, c1 );

  float b = c1 * mult / div;
  vec2 pb = x1 + b*v;

  return distance( p, pb );

}

vec3 computeNormal( vec4 n ) {
    
  // pixel scale
  vec2 un = 1. / resolution; 
  vec2 uv = gl_FragCoord.xy * un;

  // tex sample neighbour-4;
  vec3 n_r = texture2D( texture, uv + vec2( 1, 0 ) * un ).xyz;
  vec3 n_l = texture2D( texture, uv - vec2( 1, 0 ) * un ).xyz;
  vec3 n_u = texture2D( texture, uv + vec2( 0, 1 ) * un ).xyz;
  vec3 n_d = texture2D( texture, uv - vec2( 0, 1 ) * un ).xyz;

  // partial differences n-4;
  vec4 dn = vec4( n.z );
  dn -= vec4( n_r.z, n_l.z, n_u.z, n_d.z );

  // right - left, up - down;
  vec2 xy = vec2( dn.x - dn.y, dn.z - dn.w );
  xy += n_r.xy + n_l.xy + n_u.xy + n_d.xy;
  xy *= 0.976; // energy dissipation

  float z;
  z += dot( n_r.xy, - vec2( 1, 0 ) );
  z += dot( n_l.xy, + vec2( 1, 0 ) );
  z += dot( n_u.xy, - vec2( 0, 1 ) );
  z += dot( n_d.xy, + vec2( 0, 1 ) );

  return vec3( xy , z ) * 0.25;

}


void main() {

  vec2 uv = gl_FragCoord.xy / resolution;
  float asp = resolution.x / resolution.y; // aspect

  // normal sampling
  vec4 h = texture2D( texture, uv );

  // previous velocity
  float vel = h.a;
  // apply elastic-viscous acceleration
  // acc = - offset*elasticity - vel*viscosity
  vel += - ( h.z - 0.012 ) * 0.016 - vel * 0.056;

  // compute normal advection
  vec3 f = computeNormal( h );
  f.z += h.z + vel;

  // mouse interaction - continuous distance from mouse
  float dist = distToSegment(
    vec2( pmouse.x * asp, pmouse.y), // previous mouse
    vec2( mouse.x * asp, mouse.y), // current mouse
    vec2( uv.x * asp, uv.y) // fragcoord
  );

  float mSize = 0.065; // mouse radius
  float peak = 0.9; // max-height

  float isDisp = step( 0.5, mouse.z ); // is displaced
  
  if ( mouse.z > 0.5 && dist <= mSize ) {

    float dst = ( mSize - dist ) / mSize;
    f.z += pow( abs(dst), 1.9 ) * peak * 2.5;
    f.xy -= f.xy * pow( abs(dst), 3.9 ) * 0.1;
    f.z = min( peak, f.z );

  }

  gl_FragColor = clamp( vec4( f, vel ), -1.0, 1.0);

}
`;

const light_frag = `
precision highp float;

#define RECIPROCAL_PI 0.31830988618

uniform vec2 resolution;
uniform sampler2D texture;

float rand(vec2 co){
  return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

// based on https://www.shadertoy.com/view/MslGR8
vec3 dithering( vec3 color ) {
    //Calculate grid position
    float grid_position = rand( gl_FragCoord.xy );
    //Shift the individual colors differently, thus making it even harder to see the dithering pattern
    vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
    //modify shift acording to grid position.
    dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
    //shift the color by dither_shift
    return color + dither_shift_RGB;
}

void main() {

    vec2 uv = gl_FragCoord.xy / resolution.xy;

    vec3 N = texture2D( texture, uv ).xyz;
  
    vec3 viewPos = vec3( 0.0, 0.0, 1.2 );
    vec3 lightPos = vec3( 0.0, 1.5, 0.98 );
    vec3 fragPos = vec3( ( 2.0 * uv - 1.0 ), N.z );
    
    vec3 L = normalize( lightPos - fragPos );
    vec3 H = normalize( L + normalize( viewPos - fragPos ) );
    vec3 dN = vec3( N.xy, N.z/2.0 + 0.28 );

    float dif = max( dot( dN, L ), 0.0 );
    float spec = clamp( dot( normalize(N), H ), 0.0, 1.0 );

    float attenuation = 1.0 - length( lightPos - fragPos ) / 3.1;
    vec3 dif_int = vec3( dif * 0.3 * attenuation  );

    float shininess = 2.8;
    float ref = RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( spec, shininess );
    vec3 spec_int = vec3( ref * 0.6 * pow( attenuation, 3.0 )  );

    vec3 col = dif_int + spec_int;

    col.r = mix( col.r * 1.28, col.r, length( dif_int ) * 1.2 / 3.0 );
    col += 0.045;

    gl_FragColor = vec4( dithering(col), 1.0 );

}
`;


//
// three.js setup
//
const w = window.innerWidth;
const h = window.innerHeight;
const res = new THREE.Vector2(w, h);
const mousecoord = new THREE.Vector3();
const mouse = new THREE.Vector3();
const pmouse = new THREE.Vector3();

var renderer = new THREE.WebGLRenderer();
renderer.setSize(w, h);
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.Camera();


// render targets
let rtt = new THREE.WebGLRenderTarget(w, h, {
	minFilter: THREE.LinearFilter,
	magFilter: THREE.LinearFilter,
	format: THREE.RGBAFormat,
	type: ( /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ) ? THREE.HalfFloatType : THREE.FloatType,
	depthTest: false,
	depthBuffer: false,
	stencilBuffer: false
});

let rtt2 = rtt.clone();


//
// materials
//
const copyMaterial = new THREE.ShaderMaterial({
	vertexShader: basic_vert,
	fragmentShader: prep_frag,
	blending: THREE.NoBlending,
	transparent: false,
	fog: false,
	lights: false,
	depthWrite: false,
	depthTest: false
});

const physicsMaterial = new THREE.ShaderMaterial({
	uniforms: {
		mouse: { type: 'v3', value: mouse },
		pmouse: { type: 'v3', value: pmouse },
		resolution: { type: 'v2', value: res },
		texture: { type: 't' },
	},
	vertexShader: basic_vert,
	fragmentShader: physics_frag,
	blending: THREE.NoBlending,
	transparent: false,
	fog: false,
	lights: false,
	depthWrite: false,
	depthTest: false
});

const lightsMaterial = new THREE.ShaderMaterial({
	uniforms: {
		resolution: { type: 'v2', value: res },
		texture: { type: 't' },
	},
	vertexShader: basic_vert,
	fragmentShader: light_frag,
	blending: THREE.NoBlending,
	transparent: false,
	fog: false,
	lights: false,
	depthWrite: false,
	depthTest: false
});


//
// mesh setup
//
const geometry = new THREE.BufferGeometry();
const vertices = new Float32Array([
	-1.0, -1.0,
	3.0, -1.0,
	-1.0, 3.0
]);

geometry.addAttribute('position', new THREE.BufferAttribute(vertices, 2));

mesh = new THREE.Mesh(geometry, copyMaterial);
mesh.frustumCulled = false;
scene.add(mesh);


//
// pre-render to rtt
//

renderer.setRenderTarget(rtt);
renderer.render(scene, camera);

renderer.setRenderTarget(rtt2);
renderer.render(scene, camera);

mesh.material = physicsMaterial;


//
// listeners
//

renderer.domElement.addEventListener('mousemove', mousemove);
renderer.domElement.addEventListener('mouseout', mouseout);

renderer.domElement.addEventListener('touchmove', touch);
renderer.domElement.addEventListener('touchstart', touch);
renderer.domElement.addEventListener('touchend', touchend);

window.addEventListener('resize', resize);

renderer.setAnimationLoop(function () {

	render();

});

function render() {

	const tmp = rtt;
	rtt = rtt2;
	rtt2 = tmp;

	pmouse.copy(mouse);
	mouse.copy(mousecoord);

	if (pmouse.z == 0) pmouse.copy(mouse);

	mesh.material = physicsMaterial;
	mesh.material.uniforms.texture.value = rtt2.texture;

	renderer.setRenderTarget(rtt);
	renderer.render(scene, camera);

	mesh.material = lightsMaterial;
	mesh.material.uniforms.texture.value = rtt.texture;

	renderer.setRenderTarget(null);
	renderer.render(scene, camera);

}

function resize() {

	const h = window.innerHeight;
	const w = window.innerWidth;

	res.set(w, h);

	camera.aspect = w / h;

	rtt.setSize(w, h);
	rtt2.setSize(w, h);

	renderer.setSize(w, h);

}

function mousemove(evt) {

	mousecoord.x = evt.pageX / window.innerWidth;
	mousecoord.y = 1 - (evt.pageY / window.innerHeight);
	mousecoord.z = 1;

}


function mouseout(evt) {

	mousecoord.z = 0;

}

function touch(evt) {

	evt.preventDefault();

	mousecoord.x = evt.touches[0].pageX / window.innerWidth;
	mousecoord.y = 1 - evt.touches[0].pageY / window.innerHeight;
	mousecoord.z = 1;

}


function touchend(evt) {

	mousecoord.z = 0;

}