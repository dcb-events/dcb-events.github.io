var DcbScenarioBundle=function(t){"use strict";
  /*! *****************************************************************************
      Copyright (c) Microsoft Corporation.
  
      Permission to use, copy, modify, and/or distribute this software for any
      purpose with or without fee is hereby granted.
  
      THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
      REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
      AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
      INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
      LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
      OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
      PERFORMANCE OF THIS SOFTWARE.
      ***************************************************************************** */function e(t,e,n,i){var o,s=arguments.length,r=s<3?e:i;if("object"==typeof Reflect&&"function"==typeof Reflect.decorate)r=Reflect.decorate(t,e,n,i);else for(var a=t.length-1;a>=0;a--)(o=t[a])&&(r=(s<3?o(r):s>3?o(e,n,r):o(e,n))||r);return s>3&&r&&Object.defineProperty(e,n,r),r
  /**
       * @license
       * Copyright 2019 Google LLC
       * SPDX-License-Identifier: BSD-3-Clause
       */}const n=globalThis,i=n.ShadowRoot&&(void 0===n.ShadyCSS||n.ShadyCSS.nativeShadow)&&"adoptedStyleSheets"in Document.prototype&&"replace"in CSSStyleSheet.prototype,o=Symbol(),s=new WeakMap;let r=class{constructor(t,e,n){if(this._$cssResult$=!0,n!==o)throw Error("CSSResult is not constructable. Use `unsafeCSS` or `css` instead.");this.cssText=t,this.t=e}get styleSheet(){let t=this.o;const e=this.t;if(i&&void 0===t){const n=void 0!==e&&1===e.length;n&&(t=s.get(e)),void 0===t&&((this.o=t=new CSSStyleSheet).replaceSync(this.cssText),n&&s.set(e,t))}return t}toString(){return this.cssText}};const a=(t,...e)=>{const n=1===t.length?t[0]:e.reduce(((e,n,i)=>e+(t=>{if(!0===t._$cssResult$)return t.cssText;if("number"==typeof t)return t;throw Error("Value passed to 'css' function must be a 'css' function result: "+t+". Use 'unsafeCSS' to pass non-literal values, but take care to ensure page security.")})(n)+t[i+1]),t[0]);return new r(n,t,o)},l=i?t=>t:t=>t instanceof CSSStyleSheet?(t=>{let e="";for(const n of t.cssRules)e+=n.cssText;return(t=>new r("string"==typeof t?t:t+"",void 0,o))(e)})(t):t
  /**
       * @license
       * Copyright 2017 Google LLC
       * SPDX-License-Identifier: BSD-3-Clause
       */,{is:c,defineProperty:h,getOwnPropertyDescriptor:d,getOwnPropertyNames:p,getOwnPropertySymbols:u,getPrototypeOf:f}=Object,m=globalThis,g=m.trustedTypes,y=g?g.emptyScript:"",v=m.reactiveElementPolyfillSupport,$=(t,e)=>t,b={toAttribute(t,e){switch(e){case Boolean:t=t?y:null;break;case Object:case Array:t=null==t?t:JSON.stringify(t)}return t},fromAttribute(t,e){let n=t;switch(e){case Boolean:n=null!==t;break;case Number:n=null===t?null:Number(t);break;case Object:case Array:try{n=JSON.parse(t)}catch(t){n=null}}return n}},w=(t,e)=>!c(t,e),x={attribute:!0,type:String,converter:b,reflect:!1,hasChanged:w};Symbol.metadata??=Symbol("metadata"),m.litPropertyMetadata??=new WeakMap;class _ extends HTMLElement{static addInitializer(t){this._$Ei(),(this.l??=[]).push(t)}static get observedAttributes(){return this.finalize(),this._$Eh&&[...this._$Eh.keys()]}static createProperty(t,e=x){if(e.state&&(e.attribute=!1),this._$Ei(),this.elementProperties.set(t,e),!e.noAccessor){const n=Symbol(),i=this.getPropertyDescriptor(t,n,e);void 0!==i&&h(this.prototype,t,i)}}static getPropertyDescriptor(t,e,n){const{get:i,set:o}=d(this.prototype,t)??{get(){return this[e]},set(t){this[e]=t}};return{get(){return i?.call(this)},set(e){const s=i?.call(this);o.call(this,e),this.requestUpdate(t,s,n)},configurable:!0,enumerable:!0}}static getPropertyOptions(t){return this.elementProperties.get(t)??x}static _$Ei(){if(this.hasOwnProperty($("elementProperties")))return;const t=f(this);t.finalize(),void 0!==t.l&&(this.l=[...t.l]),this.elementProperties=new Map(t.elementProperties)}static finalize(){if(this.hasOwnProperty($("finalized")))return;if(this.finalized=!0,this._$Ei(),this.hasOwnProperty($("properties"))){const t=this.properties,e=[...p(t),...u(t)];for(const n of e)this.createProperty(n,t[n])}const t=this[Symbol.metadata];if(null!==t){const e=litPropertyMetadata.get(t);if(void 0!==e)for(const[t,n]of e)this.elementProperties.set(t,n)}this._$Eh=new Map;for(const[t,e]of this.elementProperties){const n=this._$Eu(t,e);void 0!==n&&this._$Eh.set(n,t)}this.elementStyles=this.finalizeStyles(this.styles)}static finalizeStyles(t){const e=[];if(Array.isArray(t)){const n=new Set(t.flat(1/0).reverse());for(const t of n)e.unshift(l(t))}else void 0!==t&&e.push(l(t));return e}static _$Eu(t,e){const n=e.attribute;return!1===n?void 0:"string"==typeof n?n:"string"==typeof t?t.toLowerCase():void 0}constructor(){super(),this._$Ep=void 0,this.isUpdatePending=!1,this.hasUpdated=!1,this._$Em=null,this._$Ev()}_$Ev(){this._$ES=new Promise((t=>this.enableUpdating=t)),this._$AL=new Map,this._$E_(),this.requestUpdate(),this.constructor.l?.forEach((t=>t(this)))}addController(t){(this._$EO??=new Set).add(t),void 0!==this.renderRoot&&this.isConnected&&t.hostConnected?.()}removeController(t){this._$EO?.delete(t)}_$E_(){const t=new Map,e=this.constructor.elementProperties;for(const n of e.keys())this.hasOwnProperty(n)&&(t.set(n,this[n]),delete this[n]);t.size>0&&(this._$Ep=t)}createRenderRoot(){const t=this.shadowRoot??this.attachShadow(this.constructor.shadowRootOptions);return((t,e)=>{if(i)t.adoptedStyleSheets=e.map((t=>t instanceof CSSStyleSheet?t:t.styleSheet));else for(const i of e){const e=document.createElement("style"),o=n.litNonce;void 0!==o&&e.setAttribute("nonce",o),e.textContent=i.cssText,t.appendChild(e)}})(t,this.constructor.elementStyles),t}connectedCallback(){this.renderRoot??=this.createRenderRoot(),this.enableUpdating(!0),this._$EO?.forEach((t=>t.hostConnected?.()))}enableUpdating(t){}disconnectedCallback(){this._$EO?.forEach((t=>t.hostDisconnected?.()))}attributeChangedCallback(t,e,n){this._$AK(t,n)}_$EC(t,e){const n=this.constructor.elementProperties.get(t),i=this.constructor._$Eu(t,n);if(void 0!==i&&!0===n.reflect){const o=(void 0!==n.converter?.toAttribute?n.converter:b).toAttribute(e,n.type);this._$Em=t,null==o?this.removeAttribute(i):this.setAttribute(i,o),this._$Em=null}}_$AK(t,e){const n=this.constructor,i=n._$Eh.get(t);if(void 0!==i&&this._$Em!==i){const t=n.getPropertyOptions(i),o="function"==typeof t.converter?{fromAttribute:t.converter}:void 0!==t.converter?.fromAttribute?t.converter:b;this._$Em=i,this[i]=o.fromAttribute(e,t.type),this._$Em=null}}requestUpdate(t,e,n){if(void 0!==t){if(n??=this.constructor.getPropertyOptions(t),!(n.hasChanged??w)(this[t],e))return;this.P(t,e,n)}!1===this.isUpdatePending&&(this._$ES=this._$ET())}P(t,e,n){this._$AL.has(t)||this._$AL.set(t,e),!0===n.reflect&&this._$Em!==t&&(this._$Ej??=new Set).add(t)}async _$ET(){this.isUpdatePending=!0;try{await this._$ES}catch(t){Promise.reject(t)}const t=this.scheduleUpdate();return null!=t&&await t,!this.isUpdatePending}scheduleUpdate(){return this.performUpdate()}performUpdate(){if(!this.isUpdatePending)return;if(!this.hasUpdated){if(this.renderRoot??=this.createRenderRoot(),this._$Ep){for(const[t,e]of this._$Ep)this[t]=e;this._$Ep=void 0}const t=this.constructor.elementProperties;if(t.size>0)for(const[e,n]of t)!0!==n.wrapped||this._$AL.has(e)||void 0===this[e]||this.P(e,this[e],n)}let t=!1;const e=this._$AL;try{t=this.shouldUpdate(e),t?(this.willUpdate(e),this._$EO?.forEach((t=>t.hostUpdate?.())),this.update(e)):this._$EU()}catch(e){throw t=!1,this._$EU(),e}t&&this._$AE(e)}willUpdate(t){}_$AE(t){this._$EO?.forEach((t=>t.hostUpdated?.())),this.hasUpdated||(this.hasUpdated=!0,this.firstUpdated(t)),this.updated(t)}_$EU(){this._$AL=new Map,this.isUpdatePending=!1}get updateComplete(){return this.getUpdateComplete()}getUpdateComplete(){return this._$ES}shouldUpdate(t){return!0}update(t){this._$Ej&&=this._$Ej.forEach((t=>this._$EC(t,this[t]))),this._$EU()}updated(t){}firstUpdated(t){}}_.elementStyles=[],_.shadowRootOptions={mode:"open"},_[$("elementProperties")]=new Map,_[$("finalized")]=new Map,v?.({ReactiveElement:_}),(m.reactiveElementVersions??=[]).push("2.0.4");
  /**
       * @license
       * Copyright 2017 Google LLC
       * SPDX-License-Identifier: BSD-3-Clause
       */
  const A=globalThis,E=A.trustedTypes,S=E?E.createPolicy("lit-html",{createHTML:t=>t}):void 0,C="$lit$",T=`lit$${Math.random().toFixed(9).slice(2)}$`,P="?"+T,R=`<${P}>`,O=document,k=()=>O.createComment(""),L=t=>null===t||"object"!=typeof t&&"function"!=typeof t,U=Array.isArray,H="[ \t\n\f\r]",D=/<(?:(!--|\/[^a-zA-Z])|(\/?[a-zA-Z][^>\s]*)|(\/?$))/g,N=/-->/g,M=/>/g,j=RegExp(`>|${H}(?:([^\\s"'>=/]+)(${H}*=${H}*(?:[^ \t\n\f\r"'\`<>=]|("|')|))|$)`,"g"),B=/'/g,z=/"/g,W=/^(?:script|style|textarea|title)$/i,V=(t=>(e,...n)=>({_$litType$:t,strings:e,values:n}))(1),I=Symbol.for("lit-noChange"),F=Symbol.for("lit-nothing"),q=new WeakMap,Z=O.createTreeWalker(O,129);function J(t,e){if(!U(t)||!t.hasOwnProperty("raw"))throw Error("invalid template strings array");return void 0!==S?S.createHTML(e):e}const K=(t,e)=>{const n=t.length-1,i=[];let o,s=2===e?"<svg>":3===e?"<math>":"",r=D;for(let e=0;e<n;e++){const n=t[e];let a,l,c=-1,h=0;for(;h<n.length&&(r.lastIndex=h,l=r.exec(n),null!==l);)h=r.lastIndex,r===D?"!--"===l[1]?r=N:void 0!==l[1]?r=M:void 0!==l[2]?(W.test(l[2])&&(o=RegExp("</"+l[2],"g")),r=j):void 0!==l[3]&&(r=j):r===j?">"===l[0]?(r=o??D,c=-1):void 0===l[1]?c=-2:(c=r.lastIndex-l[2].length,a=l[1],r=void 0===l[3]?j:'"'===l[3]?z:B):r===z||r===B?r=j:r===N||r===M?r=D:(r=j,o=void 0);const d=r===j&&t[e+1].startsWith("/>")?" ":"";s+=r===D?n+R:c>=0?(i.push(a),n.slice(0,c)+C+n.slice(c)+T+d):n+T+(-2===c?e:d)}return[J(t,s+(t[n]||"<?>")+(2===e?"</svg>":3===e?"</math>":"")),i]};class X{constructor({strings:t,_$litType$:e},n){let i;this.parts=[];let o=0,s=0;const r=t.length-1,a=this.parts,[l,c]=K(t,e);if(this.el=X.createElement(l,n),Z.currentNode=this.el.content,2===e||3===e){const t=this.el.content.firstChild;t.replaceWith(...t.childNodes)}for(;null!==(i=Z.nextNode())&&a.length<r;){if(1===i.nodeType){if(i.hasAttributes())for(const t of i.getAttributeNames())if(t.endsWith(C)){const e=c[s++],n=i.getAttribute(t).split(T),r=/([.?@])?(.*)/.exec(e);a.push({type:1,index:o,name:r[2],strings:n,ctor:"."===r[1]?et:"?"===r[1]?nt:"@"===r[1]?it:tt}),i.removeAttribute(t)}else t.startsWith(T)&&(a.push({type:6,index:o}),i.removeAttribute(t));if(W.test(i.tagName)){const t=i.textContent.split(T),e=t.length-1;if(e>0){i.textContent=E?E.emptyScript:"";for(let n=0;n<e;n++)i.append(t[n],k()),Z.nextNode(),a.push({type:2,index:++o});i.append(t[e],k())}}}else if(8===i.nodeType)if(i.data===P)a.push({type:2,index:o});else{let t=-1;for(;-1!==(t=i.data.indexOf(T,t+1));)a.push({type:7,index:o}),t+=T.length-1}o++}}static createElement(t,e){const n=O.createElement("template");return n.innerHTML=t,n}}function Y(t,e,n=t,i){if(e===I)return e;let o=void 0!==i?n._$Co?.[i]:n._$Cl;const s=L(e)?void 0:e._$litDirective$;return o?.constructor!==s&&(o?._$AO?.(!1),void 0===s?o=void 0:(o=new s(t),o._$AT(t,n,i)),void 0!==i?(n._$Co??=[])[i]=o:n._$Cl=o),void 0!==o&&(e=Y(t,o._$AS(t,e.values),o,i)),e}class G{constructor(t,e){this._$AV=[],this._$AN=void 0,this._$AD=t,this._$AM=e}get parentNode(){return this._$AM.parentNode}get _$AU(){return this._$AM._$AU}u(t){const{el:{content:e},parts:n}=this._$AD,i=(t?.creationScope??O).importNode(e,!0);Z.currentNode=i;let o=Z.nextNode(),s=0,r=0,a=n[0];for(;void 0!==a;){if(s===a.index){let e;2===a.type?e=new Q(o,o.nextSibling,this,t):1===a.type?e=new a.ctor(o,a.name,a.strings,this,t):6===a.type&&(e=new ot(o,this,t)),this._$AV.push(e),a=n[++r]}s!==a?.index&&(o=Z.nextNode(),s++)}return Z.currentNode=O,i}p(t){let e=0;for(const n of this._$AV)void 0!==n&&(void 0!==n.strings?(n._$AI(t,n,e),e+=n.strings.length-2):n._$AI(t[e])),e++}}class Q{get _$AU(){return this._$AM?._$AU??this._$Cv}constructor(t,e,n,i){this.type=2,this._$AH=F,this._$AN=void 0,this._$AA=t,this._$AB=e,this._$AM=n,this.options=i,this._$Cv=i?.isConnected??!0}get parentNode(){let t=this._$AA.parentNode;const e=this._$AM;return void 0!==e&&11===t?.nodeType&&(t=e.parentNode),t}get startNode(){return this._$AA}get endNode(){return this._$AB}_$AI(t,e=this){t=Y(this,t,e),L(t)?t===F||null==t||""===t?(this._$AH!==F&&this._$AR(),this._$AH=F):t!==this._$AH&&t!==I&&this._(t):void 0!==t._$litType$?this.$(t):void 0!==t.nodeType?this.T(t):(t=>U(t)||"function"==typeof t?.[Symbol.iterator])(t)?this.k(t):this._(t)}O(t){return this._$AA.parentNode.insertBefore(t,this._$AB)}T(t){this._$AH!==t&&(this._$AR(),this._$AH=this.O(t))}_(t){this._$AH!==F&&L(this._$AH)?this._$AA.nextSibling.data=t:this.T(O.createTextNode(t)),this._$AH=t}$(t){const{values:e,_$litType$:n}=t,i="number"==typeof n?this._$AC(t):(void 0===n.el&&(n.el=X.createElement(J(n.h,n.h[0]),this.options)),n);if(this._$AH?._$AD===i)this._$AH.p(e);else{const t=new G(i,this),n=t.u(this.options);t.p(e),this.T(n),this._$AH=t}}_$AC(t){let e=q.get(t.strings);return void 0===e&&q.set(t.strings,e=new X(t)),e}k(t){U(this._$AH)||(this._$AH=[],this._$AR());const e=this._$AH;let n,i=0;for(const o of t)i===e.length?e.push(n=new Q(this.O(k()),this.O(k()),this,this.options)):n=e[i],n._$AI(o),i++;i<e.length&&(this._$AR(n&&n._$AB.nextSibling,i),e.length=i)}_$AR(t=this._$AA.nextSibling,e){for(this._$AP?.(!1,!0,e);t&&t!==this._$AB;){const e=t.nextSibling;t.remove(),t=e}}setConnected(t){void 0===this._$AM&&(this._$Cv=t,this._$AP?.(t))}}class tt{get tagName(){return this.element.tagName}get _$AU(){return this._$AM._$AU}constructor(t,e,n,i,o){this.type=1,this._$AH=F,this._$AN=void 0,this.element=t,this.name=e,this._$AM=i,this.options=o,n.length>2||""!==n[0]||""!==n[1]?(this._$AH=Array(n.length-1).fill(new String),this.strings=n):this._$AH=F}_$AI(t,e=this,n,i){const o=this.strings;let s=!1;if(void 0===o)t=Y(this,t,e,0),s=!L(t)||t!==this._$AH&&t!==I,s&&(this._$AH=t);else{const i=t;let r,a;for(t=o[0],r=0;r<o.length-1;r++)a=Y(this,i[n+r],e,r),a===I&&(a=this._$AH[r]),s||=!L(a)||a!==this._$AH[r],a===F?t=F:t!==F&&(t+=(a??"")+o[r+1]),this._$AH[r]=a}s&&!i&&this.j(t)}j(t){t===F?this.element.removeAttribute(this.name):this.element.setAttribute(this.name,t??"")}}class et extends tt{constructor(){super(...arguments),this.type=3}j(t){this.element[this.name]=t===F?void 0:t}}class nt extends tt{constructor(){super(...arguments),this.type=4}j(t){this.element.toggleAttribute(this.name,!!t&&t!==F)}}class it extends tt{constructor(t,e,n,i,o){super(t,e,n,i,o),this.type=5}_$AI(t,e=this){if((t=Y(this,t,e,0)??F)===I)return;const n=this._$AH,i=t===F&&n!==F||t.capture!==n.capture||t.once!==n.once||t.passive!==n.passive,o=t!==F&&(n===F||i);i&&this.element.removeEventListener(this.name,this,n),o&&this.element.addEventListener(this.name,this,t),this._$AH=t}handleEvent(t){"function"==typeof this._$AH?this._$AH.call(this.options?.host??this.element,t):this._$AH.handleEvent(t)}}class ot{constructor(t,e,n){this.element=t,this.type=6,this._$AN=void 0,this._$AM=e,this.options=n}get _$AU(){return this._$AM._$AU}_$AI(t){Y(this,t)}}const st=A.litHtmlPolyfillSupport;st?.(X,Q),(A.litHtmlVersions??=[]).push("3.2.1");
  /**
       * @license
       * Copyright 2017 Google LLC
       * SPDX-License-Identifier: BSD-3-Clause
       */
  let rt=class extends _{constructor(){super(...arguments),this.renderOptions={host:this},this._$Do=void 0}createRenderRoot(){const t=super.createRenderRoot();return this.renderOptions.renderBefore??=t.firstChild,t}update(t){const e=this.render();this.hasUpdated||(this.renderOptions.isConnected=this.isConnected),super.update(t),this._$Do=((t,e,n)=>{const i=n?.renderBefore??e;let o=i._$litPart$;if(void 0===o){const t=n?.renderBefore??null;i._$litPart$=o=new Q(e.insertBefore(k(),t),t,void 0,n??{})}return o._$AI(t),o})(e,this.renderRoot,this.renderOptions)}connectedCallback(){super.connectedCallback(),this._$Do?.setConnected(!0)}disconnectedCallback(){super.disconnectedCallback(),this._$Do?.setConnected(!1)}render(){return I}};rt._$litElement$=!0,rt.finalized=!0,globalThis.litElementHydrateSupport?.({LitElement:rt});const at=globalThis.litElementPolyfillSupport;at?.({LitElement:rt}),(globalThis.litElementVersions??=[]).push("4.1.1");
  /**
       * @license
       * Copyright 2017 Google LLC
       * SPDX-License-Identifier: BSD-3-Clause
       */
  const lt=t=>(e,n)=>{void 0!==n?n.addInitializer((()=>{customElements.define(t,e)})):customElements.define(t,e)}
  /**
       * @license
       * Copyright 2017 Google LLC
       * SPDX-License-Identifier: BSD-3-Clause
       */,ct={attribute:!0,type:String,converter:b,reflect:!1,hasChanged:w},ht=(t=ct,e,n)=>{const{kind:i,metadata:o}=n;let s=globalThis.litPropertyMetadata.get(o);if(void 0===s&&globalThis.litPropertyMetadata.set(o,s=new Map),s.set(n.name,t),"accessor"===i){const{name:i}=n;return{set(n){const o=e.get.call(this);e.set.call(this,n),this.requestUpdate(i,o,t)},init(e){return void 0!==e&&this.P(i,void 0,t),e}}}if("setter"===i){const{name:i}=n;return function(n){const o=this[i];e.call(this,n),this.requestUpdate(i,o,t)}}throw Error("Unsupported decorator location: "+i)};function dt(t){return(e,n)=>"object"==typeof n?ht(t,e,n):((t,e,n)=>{const i=e.hasOwnProperty(n);return e.constructor.createProperty(n,i?{...t,wrapped:!0}:t),i?Object.getOwnPropertyDescriptor(e,n):void 0})(t,e,n)}const pt=["start","end"],ut=["top","right","bottom","left"].reduce(((t,e)=>t.concat(e,e+"-"+pt[0],e+"-"+pt[1])),[]),ft=Math.min,mt=Math.max,gt=Math.round,yt=t=>({x:t,y:t}),vt={left:"right",right:"left",bottom:"top",top:"bottom"},$t={start:"end",end:"start"};function bt(t,e,n){return mt(t,ft(e,n))}function wt(t,e){return"function"==typeof t?t(e):t}function xt(t){return t.split("-")[0]}function _t(t){return t.split("-")[1]}function At(t){return"x"===t?"y":"x"}function Et(t){return"y"===t?"height":"width"}function St(t){return["top","bottom"].includes(xt(t))?"y":"x"}function Ct(t){return At(St(t))}function Tt(t){return t.replace(/left|right|bottom|top/g,(t=>vt[t]))}function Pt(t){const{x:e,y:n,width:i,height:o}=t;return{width:i,height:o,top:n,left:e,right:e+i,bottom:n+o,x:e,y:n}}function Rt(t,e,n){let{reference:i,floating:o}=t;const s=St(e),r=Ct(e),a=Et(r),l=xt(e),c="y"===s,h=i.x+i.width/2-o.width/2,d=i.y+i.height/2-o.height/2,p=i[a]/2-o[a]/2;let u;switch(l){case"top":u={x:h,y:i.y-o.height};break;case"bottom":u={x:h,y:i.y+i.height};break;case"right":u={x:i.x+i.width,y:d};break;case"left":u={x:i.x-o.width,y:d};break;default:u={x:i.x,y:i.y}}switch(_t(e)){case"start":u[r]-=p*(n&&c?-1:1);break;case"end":u[r]+=p*(n&&c?-1:1)}return u}async function Ot(t,e){var n;void 0===e&&(e={});const{x:i,y:o,platform:s,rects:r,elements:a,strategy:l}=t,{boundary:c="clippingAncestors",rootBoundary:h="viewport",elementContext:d="floating",altBoundary:p=!1,padding:u=0}=wt(e,t),f=function(t){return"number"!=typeof t?function(t){return{top:0,right:0,bottom:0,left:0,...t}}(t):{top:t,right:t,bottom:t,left:t}}(u),m=a[p?"floating"===d?"reference":"floating":d],g=Pt(await s.getClippingRect({element:null==(n=await(null==s.isElement?void 0:s.isElement(m)))||n?m:m.contextElement||await(null==s.getDocumentElement?void 0:s.getDocumentElement(a.floating)),boundary:c,rootBoundary:h,strategy:l})),y="floating"===d?{x:i,y:o,width:r.floating.width,height:r.floating.height}:r.reference,v=await(null==s.getOffsetParent?void 0:s.getOffsetParent(a.floating)),$=await(null==s.isElement?void 0:s.isElement(v))&&await(null==s.getScale?void 0:s.getScale(v))||{x:1,y:1},b=Pt(s.convertOffsetParentRelativeRectToViewportRelativeRect?await s.convertOffsetParentRelativeRectToViewportRelativeRect({elements:a,rect:y,offsetParent:v,strategy:l}):y);return{top:(g.top-b.top+f.top)/$.y,bottom:(b.bottom-g.bottom+f.bottom)/$.y,left:(g.left-b.left+f.left)/$.x,right:(b.right-g.right+f.right)/$.x}}function kt(t,e,n){return(t?[...n.filter((e=>_t(e)===t)),...n.filter((e=>_t(e)!==t))]:n.filter((t=>xt(t)===t))).filter((n=>!t||(_t(n)===t||!!e&&function(t){return t.replace(/start|end/g,(t=>$t[t]))}(n)!==n)))}function Lt(){return"undefined"!=typeof window}function Ut(t){return Nt(t)?(t.nodeName||"").toLowerCase():"#document"}function Ht(t){var e;return(null==t||null==(e=t.ownerDocument)?void 0:e.defaultView)||window}function Dt(t){var e;return null==(e=(Nt(t)?t.ownerDocument:t.document)||window.document)?void 0:e.documentElement}function Nt(t){return!!Lt()&&(t instanceof Node||t instanceof Ht(t).Node)}function Mt(t){return!!Lt()&&(t instanceof Element||t instanceof Ht(t).Element)}function jt(t){return!!Lt()&&(t instanceof HTMLElement||t instanceof Ht(t).HTMLElement)}function Bt(t){return!(!Lt()||"undefined"==typeof ShadowRoot)&&(t instanceof ShadowRoot||t instanceof Ht(t).ShadowRoot)}function zt(t){const{overflow:e,overflowX:n,overflowY:i,display:o}=Zt(t);return/auto|scroll|overlay|hidden|clip/.test(e+i+n)&&!["inline","contents"].includes(o)}function Wt(t){return["table","td","th"].includes(Ut(t))}function Vt(t){return[":popover-open",":modal"].some((e=>{try{return t.matches(e)}catch(t){return!1}}))}function It(t){const e=Ft(),n=Mt(t)?Zt(t):t;return["transform","translate","scale","rotate","perspective"].some((t=>!!n[t]&&"none"!==n[t]))||!!n.containerType&&"normal"!==n.containerType||!e&&!!n.backdropFilter&&"none"!==n.backdropFilter||!e&&!!n.filter&&"none"!==n.filter||["transform","translate","scale","rotate","perspective","filter"].some((t=>(n.willChange||"").includes(t)))||["paint","layout","strict","content"].some((t=>(n.contain||"").includes(t)))}function Ft(){return!("undefined"==typeof CSS||!CSS.supports)&&CSS.supports("-webkit-backdrop-filter","none")}function qt(t){return["html","body","#document"].includes(Ut(t))}function Zt(t){return Ht(t).getComputedStyle(t)}function Jt(t){return Mt(t)?{scrollLeft:t.scrollLeft,scrollTop:t.scrollTop}:{scrollLeft:t.scrollX,scrollTop:t.scrollY}}function Kt(t){if("html"===Ut(t))return t;const e=t.assignedSlot||t.parentNode||Bt(t)&&t.host||Dt(t);return Bt(e)?e.host:e}function Xt(t){const e=Kt(t);return qt(e)?t.ownerDocument?t.ownerDocument.body:t.body:jt(e)&&zt(e)?e:Xt(e)}function Yt(t,e,n){var i;void 0===e&&(e=[]);const o=Xt(t),s=o===(null==(i=t.ownerDocument)?void 0:i.body),r=Ht(o);return s?(Gt(r),e.concat(r,r.visualViewport||[],zt(o)?o:[],[])):e.concat(o,Yt(o,[]))}function Gt(t){return t.parent&&Object.getPrototypeOf(t.parent)?t.frameElement:null}function Qt(t){const e=Zt(t);let n=parseFloat(e.width)||0,i=parseFloat(e.height)||0;const o=jt(t),s=o?t.offsetWidth:n,r=o?t.offsetHeight:i,a=gt(n)!==s||gt(i)!==r;return a&&(n=s,i=r),{width:n,height:i,$:a}}function te(t){return Mt(t)?t:t.contextElement}function ee(t){const e=te(t);if(!jt(e))return yt(1);const n=e.getBoundingClientRect(),{width:i,height:o,$:s}=Qt(e);let r=(s?gt(n.width):n.width)/i,a=(s?gt(n.height):n.height)/o;return r&&Number.isFinite(r)||(r=1),a&&Number.isFinite(a)||(a=1),{x:r,y:a}}const ne=yt(0);function ie(t){const e=Ht(t);return Ft()&&e.visualViewport?{x:e.visualViewport.offsetLeft,y:e.visualViewport.offsetTop}:ne}function oe(t,e,n,i){void 0===e&&(e=!1),void 0===n&&(n=!1);const o=t.getBoundingClientRect(),s=te(t);let r=yt(1);e&&(i?Mt(i)&&(r=ee(i)):r=ee(t));const a=function(t,e,n){return void 0===e&&(e=!1),!(!n||e&&n!==Ht(t))&&e}(s,n,i)?ie(s):yt(0);let l=(o.left+a.x)/r.x,c=(o.top+a.y)/r.y,h=o.width/r.x,d=o.height/r.y;if(s){const t=Ht(s),e=i&&Mt(i)?Ht(i):i;let n=t,o=Gt(n);for(;o&&i&&e!==n;){const t=ee(o),e=o.getBoundingClientRect(),i=Zt(o),s=e.left+(o.clientLeft+parseFloat(i.paddingLeft))*t.x,r=e.top+(o.clientTop+parseFloat(i.paddingTop))*t.y;l*=t.x,c*=t.y,h*=t.x,d*=t.y,l+=s,c+=r,n=Ht(o),o=Gt(n)}}return Pt({width:h,height:d,x:l,y:c})}function se(t,e){const n=Jt(t).scrollLeft;return e?e.left+n:oe(Dt(t)).left+n}function re(t,e,n){void 0===n&&(n=!1);const i=t.getBoundingClientRect();return{x:i.left+e.scrollLeft-(n?0:se(t,i)),y:i.top+e.scrollTop}}function ae(t,e,n){let i;if("viewport"===e)i=function(t,e){const n=Ht(t),i=Dt(t),o=n.visualViewport;let s=i.clientWidth,r=i.clientHeight,a=0,l=0;if(o){s=o.width,r=o.height;const t=Ft();(!t||t&&"fixed"===e)&&(a=o.offsetLeft,l=o.offsetTop)}return{width:s,height:r,x:a,y:l}}(t,n);else if("document"===e)i=function(t){const e=Dt(t),n=Jt(t),i=t.ownerDocument.body,o=mt(e.scrollWidth,e.clientWidth,i.scrollWidth,i.clientWidth),s=mt(e.scrollHeight,e.clientHeight,i.scrollHeight,i.clientHeight);let r=-n.scrollLeft+se(t);const a=-n.scrollTop;return"rtl"===Zt(i).direction&&(r+=mt(e.clientWidth,i.clientWidth)-o),{width:o,height:s,x:r,y:a}}(Dt(t));else if(Mt(e))i=function(t,e){const n=oe(t,!0,"fixed"===e),i=n.top+t.clientTop,o=n.left+t.clientLeft,s=jt(t)?ee(t):yt(1);return{width:t.clientWidth*s.x,height:t.clientHeight*s.y,x:o*s.x,y:i*s.y}}(e,n);else{const n=ie(t);i={x:e.x-n.x,y:e.y-n.y,width:e.width,height:e.height}}return Pt(i)}function le(t,e){const n=Kt(t);return!(n===e||!Mt(n)||qt(n))&&("fixed"===Zt(n).position||le(n,e))}function ce(t,e,n){const i=jt(e),o=Dt(e),s="fixed"===n,r=oe(t,!0,s,e);let a={scrollLeft:0,scrollTop:0};const l=yt(0);if(i||!i&&!s)if(("body"!==Ut(e)||zt(o))&&(a=Jt(e)),i){const t=oe(e,!0,s,e);l.x=t.x+e.clientLeft,l.y=t.y+e.clientTop}else o&&(l.x=se(o));const c=!o||i||s?yt(0):re(o,a);return{x:r.left+a.scrollLeft-l.x-c.x,y:r.top+a.scrollTop-l.y-c.y,width:r.width,height:r.height}}function he(t){return"static"===Zt(t).position}function de(t,e){if(!jt(t)||"fixed"===Zt(t).position)return null;if(e)return e(t);let n=t.offsetParent;return Dt(t)===n&&(n=n.ownerDocument.body),n}function pe(t,e){const n=Ht(t);if(Vt(t))return n;if(!jt(t)){let e=Kt(t);for(;e&&!qt(e);){if(Mt(e)&&!he(e))return e;e=Kt(e)}return n}let i=de(t,e);for(;i&&Wt(i)&&he(i);)i=de(i,e);return i&&qt(i)&&he(i)&&!It(i)?n:i||function(t){let e=Kt(t);for(;jt(e)&&!qt(e);){if(It(e))return e;if(Vt(e))return null;e=Kt(e)}return null}(t)||n}const ue={convertOffsetParentRelativeRectToViewportRelativeRect:function(t){let{elements:e,rect:n,offsetParent:i,strategy:o}=t;const s="fixed"===o,r=Dt(i),a=!!e&&Vt(e.floating);if(i===r||a&&s)return n;let l={scrollLeft:0,scrollTop:0},c=yt(1);const h=yt(0),d=jt(i);if((d||!d&&!s)&&(("body"!==Ut(i)||zt(r))&&(l=Jt(i)),jt(i))){const t=oe(i);c=ee(i),h.x=t.x+i.clientLeft,h.y=t.y+i.clientTop}const p=!r||d||s?yt(0):re(r,l,!0);return{width:n.width*c.x,height:n.height*c.y,x:n.x*c.x-l.scrollLeft*c.x+h.x+p.x,y:n.y*c.y-l.scrollTop*c.y+h.y+p.y}},getDocumentElement:Dt,getClippingRect:function(t){let{element:e,boundary:n,rootBoundary:i,strategy:o}=t;const s=[..."clippingAncestors"===n?Vt(e)?[]:function(t,e){const n=e.get(t);if(n)return n;let i=Yt(t,[]).filter((t=>Mt(t)&&"body"!==Ut(t))),o=null;const s="fixed"===Zt(t).position;let r=s?Kt(t):t;for(;Mt(r)&&!qt(r);){const e=Zt(r),n=It(r);n||"fixed"!==e.position||(o=null),(s?!n&&!o:!n&&"static"===e.position&&o&&["absolute","fixed"].includes(o.position)||zt(r)&&!n&&le(t,r))?i=i.filter((t=>t!==r)):o=e,r=Kt(r)}return e.set(t,i),i}(e,this._c):[].concat(n),i],r=s[0],a=s.reduce(((t,n)=>{const i=ae(e,n,o);return t.top=mt(i.top,t.top),t.right=ft(i.right,t.right),t.bottom=ft(i.bottom,t.bottom),t.left=mt(i.left,t.left),t}),ae(e,r,o));return{width:a.right-a.left,height:a.bottom-a.top,x:a.left,y:a.top}},getOffsetParent:pe,getElementRects:async function(t){const e=this.getOffsetParent||pe,n=this.getDimensions,i=await n(t.floating);return{reference:ce(t.reference,await e(t.floating),t.strategy),floating:{x:0,y:0,width:i.width,height:i.height}}},getClientRects:function(t){return Array.from(t.getClientRects())},getDimensions:function(t){const{width:e,height:n}=Qt(t);return{width:e,height:n}},getScale:ee,isElement:Mt,isRTL:function(t){return"rtl"===Zt(t).direction}},fe=function(t){return void 0===t&&(t=0),{name:"offset",options:t,async fn(e){var n,i;const{x:o,y:s,placement:r,middlewareData:a}=e,l=await async function(t,e){const{placement:n,platform:i,elements:o}=t,s=await(null==i.isRTL?void 0:i.isRTL(o.floating)),r=xt(n),a=_t(n),l="y"===St(n),c=["left","top"].includes(r)?-1:1,h=s&&l?-1:1,d=wt(e,t);let{mainAxis:p,crossAxis:u,alignmentAxis:f}="number"==typeof d?{mainAxis:d,crossAxis:0,alignmentAxis:null}:{mainAxis:d.mainAxis||0,crossAxis:d.crossAxis||0,alignmentAxis:d.alignmentAxis};return a&&"number"==typeof f&&(u="end"===a?-1*f:f),l?{x:u*h,y:p*c}:{x:p*c,y:u*h}}(e,t);return r===(null==(n=a.offset)?void 0:n.placement)&&null!=(i=a.arrow)&&i.alignmentOffset?{}:{x:o+l.x,y:s+l.y,data:{...l,placement:r}}}}},me=function(t){return void 0===t&&(t={}),{name:"autoPlacement",options:t,async fn(e){var n,i,o;const{rects:s,middlewareData:r,placement:a,platform:l,elements:c}=e,{crossAxis:h=!1,alignment:d,allowedPlacements:p=ut,autoAlignment:u=!0,...f}=wt(t,e),m=void 0!==d||p===ut?kt(d||null,u,p):p,g=await Ot(e,f),y=(null==(n=r.autoPlacement)?void 0:n.index)||0,v=m[y];if(null==v)return{};const $=function(t,e,n){void 0===n&&(n=!1);const i=_t(t),o=Ct(t),s=Et(o);let r="x"===o?i===(n?"end":"start")?"right":"left":"start"===i?"bottom":"top";return e.reference[s]>e.floating[s]&&(r=Tt(r)),[r,Tt(r)]}(v,s,await(null==l.isRTL?void 0:l.isRTL(c.floating)));if(a!==v)return{reset:{placement:m[0]}};const b=[g[xt(v)],g[$[0]],g[$[1]]],w=[...(null==(i=r.autoPlacement)?void 0:i.overflows)||[],{placement:v,overflows:b}],x=m[y+1];if(x)return{data:{index:y+1,overflows:w},reset:{placement:x}};const _=w.map((t=>{const e=_t(t.placement);return[t.placement,e&&h?t.overflows.slice(0,2).reduce(((t,e)=>t+e),0):t.overflows[0],t.overflows]})).sort(((t,e)=>t[1]-e[1])),A=_.filter((t=>t[2].slice(0,_t(t[0])?2:3).every((t=>t<=0)))),E=(null==(o=A[0])?void 0:o[0])||_[0][0];return E!==a?{data:{index:y+1,overflows:w},reset:{placement:E}}:{}}}},ge=function(t){return void 0===t&&(t={}),{name:"shift",options:t,async fn(e){const{x:n,y:i,placement:o}=e,{mainAxis:s=!0,crossAxis:r=!1,limiter:a={fn:t=>{let{x:e,y:n}=t;return{x:e,y:n}}},...l}=wt(t,e),c={x:n,y:i},h=await Ot(e,l),d=St(xt(o)),p=At(d);let u=c[p],f=c[d];if(s){const t="y"===p?"bottom":"right";u=bt(u+h["y"===p?"top":"left"],u,u-h[t])}if(r){const t="y"===d?"bottom":"right";f=bt(f+h["y"===d?"top":"left"],f,f-h[t])}const m=a.fn({...e,[p]:u,[d]:f});return{...m,data:{x:m.x-n,y:m.y-i,enabled:{[p]:s,[d]:r}}}}}},ye=(t,e,n)=>{const i=new Map,o={platform:ue,...n},s={...o.platform,_c:i};return(async(t,e,n)=>{const{placement:i="bottom",strategy:o="absolute",middleware:s=[],platform:r}=n,a=s.filter(Boolean),l=await(null==r.isRTL?void 0:r.isRTL(e));let c=await r.getElementRects({reference:t,floating:e,strategy:o}),{x:h,y:d}=Rt(c,i,l),p=i,u={},f=0;for(let n=0;n<a.length;n++){const{name:s,fn:m}=a[n],{x:g,y:y,data:v,reset:$}=await m({x:h,y:d,initialPlacement:i,placement:p,strategy:o,middlewareData:u,rects:c,platform:r,elements:{reference:t,floating:e}});h=null!=g?g:h,d=null!=y?y:d,u={...u,[s]:{...u[s],...v}},$&&f<=50&&(f++,"object"==typeof $&&($.placement&&(p=$.placement),$.rects&&(c=!0===$.rects?await r.getElementRects({reference:t,floating:e,strategy:o}):$.rects),({x:h,y:d}=Rt(c,p,l))),n=-1)}return{x:h,y:d,placement:p,strategy:o,middlewareData:u}})(t,e,{...o,platform:s})},ve=["pointerenter","focus"],$e=["pointerleave","blur","keydown","click"];let be=class extends rt{static lazy(t,e){const n=()=>{const i=document.createElement("dcb-popover");e(i),t.parentNode.insertBefore(i,t.nextSibling),i.show(),ve.forEach((e=>t.removeEventListener(e,n)))};ve.forEach((e=>t.addEventListener(e,n)))}constructor(){super(),this.showing=!1,this.offset=4,this._target=null,this.show=()=>{this.style.cssText="",null!==this.target&&(ye(this.target,this,{strategy:"fixed",middleware:[fe(this.offset),ge(),me({allowedPlacements:["top","bottom"]})]}).then((({x:t,y:e})=>{this.style.left=`${t}px`,this.style.top=`${e}px`})),this.showing=!0)},this.hide=()=>{this.showing=!1},this.finishHide=()=>{this.showing||(this.style.display="none")},this.addEventListener("transitionend",this.finishHide)}connectedCallback(){super.connectedCallback(),this.target??=this.previousElementSibling,this.finishHide()}get target(){return this._target}set target(t){this.target&&(ve.forEach((t=>this.target.removeEventListener(t,this.show))),$e.forEach((t=>this.target.removeEventListener(t,this.hide)))),t&&(ve.forEach((e=>t.addEventListener(e,this.show))),$e.forEach((e=>t.addEventListener(e,this.hide)))),this._target=t}render(){return V`<slot></slot>`}};be.styles=a`
      :host {
        /* Position fixed to help ensure the popover is "on top" */
        position: fixed;
        border: 1px solid #ccc;
        background: #efe7c4;
        padding: 1em;
        border-radius: 0.2em;
        display: inline-block;
        pointer-events: none;
  
        /* Animate in */
        opacity: 0;
        transform: scale(0.75);
        transition: opacity, transform;
        transition-duration: 0.2s;
        z-index: 3000;
      }
  
      :host([showing]) {
        opacity: 1;
        transform: scale(1);
      }
    `,e([dt({reflect:!0,type:Boolean})],be.prototype,"showing",void 0),e([dt({type:Number})],be.prototype,"offset",void 0),be=e([lt("dcb-popover")],be);let we=class extends rt{constructor(){super(...arguments),this.data={}}render(){return V`<div>${this.renderValue(this.data)}</div>`}renderValue(t){return"object"==typeof t&&null!==t?V`<dl>
          ${Object.keys(t).map((e=>V`<dt>${e}</dt>
                <dd>
                  ${Object.prototype.hasOwnProperty.call(t,e)?this.renderValue(t[e]):"-"}
                </dd>`))}
        </dl>`:V`${t}`}};we.styles=a`
      dl {
        text-align: left;
        display: grid;
        grid-template-columns: max-content auto;
        gap: 0.5em;
      }
  
      dt {
        grid-column-start: 1;
        font-weight: bold;
      }
  
      dd {
        grid-column-start: 2;
      }
    `,e([dt({type:Object})],we.prototype,"data",void 0),we=e([lt("dcb-data")],we);let xe=class extends rt{constructor(){super(...arguments),this.type="event",this.text="",this.tags=[],this.data={}}render(){return V`<div class="message ${this.type}">
        <h3>${this.text}</h3>
        <dcb-popover ?hidden=${null===this.data}><dcb-data .data=${this.data}></dcb-popover>
        <ul class="tags">
          ${this.tags.map((t=>V`<li>
              <span class="tag" style="">${t}</span>
            </li>`))}
        </ul>
      </div>`}};xe.styles=a`
      :host {
        cursor: pointer;
      }
      .message {
        width: 8em;
        height: 8em;
        flex-grow: 0;
  
        border-radius: 0.3em;
  
        display: inline-flex;
        vertical-align: top;
        justify-content: center;
        align-items: center;
        text-align: center;
  
        color: black;
        margin-right: 6em;
        padding: 0.5em;
        position: relative;
  
        filter: drop-shadow(0.1em 0.3em 0.3em rgba(0, 0, 0, 0.3));
      }
      .event {
        background-color: #f3ae6b;
      }
  
      .command {
        background-color: #87d1f2;
      }
      .error {
        background-color: #d9939d;
      }
  
      h3 {
        font-size: 1em;
        font-weight: normal;
  
        max-width: 100%;
        max-height: 100%;
        margin: 0;
      }
  
      .tags {
        position: absolute;
        left: 88%;
        top: 20%;
        z-index: 1000;
        width: 6em;
        margin: 0;
        padding: 0;
      }
      .tags li {
        margin: 0 0 0.4em 0;
        padding: 0;
        text-align: left;
        list-style: none;
        filter: drop-shadow(0.1em 0.2em 0.2em rgba(0, 0, 0, 0.3));
      }
      .tag {
        display: inline-block;
        margin: 0;
        text-align: center;
        padding: 0.3em 0.6em 0.3em 1.6em;
        font-size: 0.7em;
        background-color: #efe7c4;
        color: black;
        border-radius: 0.2em;
        clip-path: polygon(0 50%, 1em 0, 100% 0, 100% 100%, 1em 100%);
        mask: radial-gradient(
          circle 0.3em at 1em 50%,
          transparent 0.3em,
          black 0.3em
        );
        transform: rotate(35deg);
        word-break: break-word;
      }
    `,e([dt()],xe.prototype,"type",void 0),e([dt()],xe.prototype,"text",void 0),e([dt({type:Array})],xe.prototype,"tags",void 0),e([dt({type:Object})],xe.prototype,"data",void 0),xe=e([lt("dcb-message")],xe);let _e=class extends rt{constructor(){super(...arguments),this.description="Test case",this.failed=!1,this.givenEvents=[],this.whenCommandType="",this.thenExpectedError="",this.thenExpectedEvent=null}render(){return V`<section class="test-case${this.failed?" failed":""}">
        <h1>${this.description}</h1>
  
        <div class="given">
          <h2>Given</h2>
          ${this.givenEvents.map(this.renderEvent)}
        </div>
        <div class="when">
          <h2>When</h2>
          ${this.renderCommand(this.whenCommandType)}
        </div>
        <div class="then">
          <h2>Then</h2>
          ${null!==this.thenExpectedEvent?this.renderEvent(this.thenExpectedEvent):this.renderError(this.thenExpectedError)}
        </div>
      </section>`}renderEvent(t){return V`<dcb-message
        type="event"
        text=${t.type}
        .tags=${t.tags}
        .data=${t.data}
      ></dcb-message>`}renderCommand(t){return V`<dcb-message type="command" text=${t}></dcb-message>`}renderError(t){return V`<dcb-message type="error" text=${t}></dcb-message>`}};return _e.styles=a`
      .test-case {
        position: relative;
        color: black;
        margin: 0 0 2em 0;
        padding: 0;
        border-radius: 0.2em;
        width: fit-content;
        background: #eee;
        border: 1px solid #ccc;
      }
  
      .test-case::after {
        content: '✔';
        position: absolute;
        top: 0.7em;
        right: 0.7em;
        width: 1.5em;
        height: 1.5em;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.2em;
        color: white;
        background-color: #4caf50;
      }
  
      .test-case.failed::after {
        content: '✖';
        background-color: #dd2f48;
      }
  
      .test-case > h1 {
        margin: 0 0 1em 0;
        padding: 0.8em 2.5em 1em 1em;
        font-size: 1.2em;
        font-weight: normal;
        background: #d5e5d5;
      }
      .test-case.failed > h1 {
        background: #eebdc6;
      }
  
      .given,
      .when,
      .then {
        display: flex;
        flex-direction: row;
        width: fit-content;
        align-items: center;
        margin-bottom: 1.2em;
      }
      .given > h2,
      .when > h2,
      .then > h2 {
        margin: 0 1em;
        font-size: 1.2em;
        vertical-align: center;
        width: 4em;
      }
    `,e([dt()],_e.prototype,"description",void 0),e([dt({type:Boolean})],_e.prototype,"failed",void 0),e([dt({type:Array})],_e.prototype,"givenEvents",void 0),e([dt()],_e.prototype,"whenCommandType",void 0),e([dt()],_e.prototype,"thenExpectedError",void 0),e([dt({type:Object})],_e.prototype,"thenExpectedEvent",void 0),_e=e([lt("dcb-testcase")],_e),t.DcbScenario=class extends rt{constructor(){super(...arguments),this.eventDefinitions=[],this.projections=[],this.commandDefinitions=[],this.testCases=[]}render(){return V`
        ${this.testCases.map((t=>this.renderTestCase(t)))}
        <div></div>
      </div>`}renderTestCase(t){return V` <dcb-testcase
        description=${t.description}
        .givenEvents=${t.givenEvents?t.givenEvents.map((t=>this.transformEvent(t))):[]}
        whenCommandType=${this.camelCaseToWords(t.whenCommand.type)}
        .thenExpectedEvent=${t.thenExpectedEvent?this.transformEvent(t.thenExpectedEvent):null}
        thenExpectedError=${t.thenExpectedError||""}
      ></dcb-testcase>`}transformEvent(t){const e=this.eventDefinitions.find((e=>e.name===t.type));if(void 0===e)throw new Error(`Failed to find event definition for event of type "${t.type}"`);return{type:this.camelCaseToWords(t.type),tags:e.tagResolvers.map((e=>this.replacePlaceholders(e,{data:t.data}))),data:t.data}}camelCaseToWords(t){return t.replace(/([a-z])([A-Z])/g,"$1 $2").replace(/^./,(t=>t.toUpperCase()))}replacePlaceholders(t,e){return t.replace(/\{([^}]+)\}/g,((t,n)=>{const i=n.split(".").reduce(((t,e)=>t&&"object"==typeof t?t[e]:void 0),e);return void 0!==i?String(i):`{${n}}`}))}},t.DcbScenario.styles=a`
      div {
        clear: both;
      }
      dcb-testcase {
        float: left;
        margin-right: 2em;
      }
    `,e([dt({type:Array})],t.DcbScenario.prototype,"eventDefinitions",void 0),e([dt({type:Array})],t.DcbScenario.prototype,"projections",void 0),e([dt({type:Array})],t.DcbScenario.prototype,"commandDefinitions",void 0),e([dt({type:Array})],t.DcbScenario.prototype,"testCases",void 0),t.DcbScenario=e([lt("dcb-scenario")],t.DcbScenario),t}({});
  