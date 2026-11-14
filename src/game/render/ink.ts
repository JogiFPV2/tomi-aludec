import * as THREE from 'three';

/**
 * Kontur „tuszem” jako przebieg po całym obrazie: szuka skoków głębi (krawędzie brył, sylwetki)
 * i rysuje tam lekko drżącą, nierówną kreskę – jak w ręcznym rysunku. Działa ze wszystkich stron bryły.
 */
export class InkPass {
  readonly target: THREE.WebGLRenderTarget;
  private scene = new THREE.Scene(); private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;

  constructor(private renderer: THREE.WebGLRenderer, low: boolean) {
    this.target = new THREE.WebGLRenderTarget(4, 4, { samples: low ? 0 : 4, type: THREE.HalfFloatType });
    this.target.depthTexture = new THREE.DepthTexture(4, 4); this.target.depthTexture.type = THREE.UnsignedIntType;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tColor: { value: this.target.texture }, tDepth: { value: this.target.depthTexture }, texel: { value: new THREE.Vector2() }, range: { value: 200 }, width: { value: 1.5 }, ink: { value: new THREE.Color(0x1c0f0c) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }',
      fragmentShader: `
        uniform sampler2D tColor; uniform sampler2D tDepth; uniform vec2 texel; uniform float range; uniform float width; uniform vec3 ink; varying vec2 vUv;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f); return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y); }
        float D(vec2 uv){ return texture2D(tDepth, uv).x * range; }
        void main(){
          vec2 px = vUv / texel;
          // drżenie ręki: kreska lekko „pływa” i zmienia grubość
          vec2 uv = vUv + (vec2(noise(px * .045), noise(px * .045 + 31.7)) - .5) * texel * 2.6;
          vec2 o = texel * width * (.65 + noise(px * .02 + 9.) * .9);
          float d = D(uv);
          float l = abs(D(uv + vec2(o.x, 0.)) + D(uv - vec2(o.x, 0.)) - 2. * d) + abs(D(uv + vec2(0., o.y)) + D(uv - vec2(0., o.y)) - 2. * d);
          l = max(l, abs(D(uv + o) + D(uv - o) - 2. * d) + abs(D(uv + vec2(o.x, -o.y)) + D(uv - vec2(o.x, -o.y)) - 2. * d));
          float e = smoothstep(.03, .075, l);
          vec3 c = texture2D(tColor, vUv).rgb;
          gl_FragColor = vec4(mix(c, ink, e * .94), 1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false, depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat); quad.frustumCulled = false; this.scene.add(quad);
  }

  setSize(w: number, h: number, pixelRatio: number, camera: THREE.OrthographicCamera) {
    const W = Math.max(2, Math.round(w * pixelRatio)), H = Math.max(2, Math.round(h * pixelRatio));
    this.target.setSize(W, H); (this.mat.uniforms.texel.value as THREE.Vector2).set(1 / W, 1 / H);
    this.mat.uniforms.width.value = 1.35 * pixelRatio; this.mat.uniforms.range.value = camera.far - camera.near;
  }

  render(scene: THREE.Scene, camera: THREE.Camera) {
    this.renderer.setRenderTarget(this.target); this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null); this.renderer.render(this.scene, this.cam);
  }

  dispose() { this.target.depthTexture?.dispose(); this.target.dispose(); this.mat.dispose(); }
}
