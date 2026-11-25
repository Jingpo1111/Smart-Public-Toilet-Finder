import type {Point} from '../types/api'
type Event={latlng:{lat:number;lng:number}}
interface Layer {addTo(map:MapLayer|Group):this;on(event:string,fn:(event:Event)=>void):this}
interface Marker extends Layer{getLatLng():Event['latlng'];bindPopup(content:HTMLElement):this}
interface Group extends Layer{clearLayers():void}
interface MapLayer {setView(point:Point,zoom:number):this;getZoom():number;setZoom(z:number):this;fitBounds(p:Point[],o?:object):this;on(event:string,fn:(e:Event)=>void):this;remove():void;invalidateSize():void;project(p:Point,z:number):{x:number;y:number}}
declare const L:{map:(el:HTMLElement,opts?:object)=>MapLayer;tileLayer:(url:string,opts:object)=>Layer;layerGroup:()=>Group;marker:(p:Point,o?:object)=>Marker;circleMarker:(p:Point,o:object)=>Marker;icon:(opts:object)=>unknown;divIcon:(opts:object)=>unknown}
export default L
