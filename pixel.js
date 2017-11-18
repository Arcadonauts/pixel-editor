/*
TO DO:	
	
	Add:
		Load?	
	Fix:
			
				
TO DONE:
	HSV Support 
	Limits on Undo 
	Rect and Circ tool identiifiers 
	Eye Dropper
	Tool Tips 
	Save
		Pixel Size 
		png/jpeg 
	Alpha color
	Deactivate buttons 
	More Colors 
	Delete Frames 
	Allow for more frames 
	Adjustable Framerate 
	Manual Color 
	Undo Color Changes
	Undo Resize 
	Animation Slides 
	Shortcut Keys
	Tools
		Paintbrush
		Erase
		Fill
		Rectangle
		Undo
	Debug:
		Why is the framerate tanking?
			Because .beginPath() wasn't called 
		Bug undo issues when zooming during playing	
			stop playing when zooming.
		Fill only zoomed in area
			Tile checks if not dead before accepting paint 
			
		

*/

var pixel = (function(){
	
	// Check for the various File API support.
if (window.File && window.FileReader && window.FileList && window.Blob) {
  // Great success! All the File APIs are supported.
} else {
  alert('The File APIs are not fully supported in this browser.');
}
	
	var pico8 = ['#000000',  '#FFF1E8', '#1D2B53', '#7E2553', '#008751', '#AB5236', '#5F574F', '#C2C3C7', '#FF004D', '#FFA300', '#FFEC27', '#00E436', '#29ADFF', '#83769C', '#FF77A8', '#FFCCAA'];
	
	const WIDTH = 640
	const HEIGHT = 448
	const TW = 16
	const MAX_ROWS = 40
	const MAX_COLS = 40 
	
	const WHITE = '#FFF1E8'
	const BLACK = '#000000'
	const GREY = '#4d4d4d'
	const BORDER = '#ff004d'
	const BLUE = '009fff'
	
	const RE_FONT_SIZE = /(\d+)px/
	const RE_COLOR = /^#?([0-9a-fA-F]{6}$)/
	
	var pixel = {
		drawables : [],
		transparency: 'grey',
		pico8: pico8
	}
	
	
	
	
	
	var log = console.log
	
	function rgb_to_hsv(rgb){
		var r = rgb[0]/255
		var g = rgb[1]/255
		var b = rgb[2]/255
		
		var min, max, delta, h, s, v 
		
		min = Math.min(r, g, b)
		max = Math.max(r, g, b)
		
		v = max 
		delta = max - min 
		 
		if(delta < 0.00001){
			s = 0 
			h = 0 
			return [h,s,v]
		}
		if(max > 0){
			s = delta / max 
		}else{
			s = 0 
			h = 0 
			return [h, s, v]
		}
		if(r >= max){
			h = (g - b)/delta 
		}else if(g >= max){
			h = 2 + (b - r)/delta 
		}else{
			h = 4 + (r - g)/delta 
		}
		h *= 60 
		if( h < 0){
			h += 360
		}
		return [h, s, v]
	}
	
	function hsv_to_rgb(hsv){
		var r, g, b 
		var rr, gg, bb 
		rr = gg = bb = 0
		var h = hsv[0]
		var s = hsv[1]
		var v = hsv[2]
		var c = v*s 
		x = c*(1-Math.abs((h/60) % 2 - 1))
		m = v - c 
		if(h < 60){
			rr = c 
			gg = x 
		}else if(h < 120){
			rr = x 
			gg = c 
		}else if(h < 180){
			gg = c 
			bb = x 
		}else if(h < 240){
			gg = x 
			bb = c 
		}else if(h < 300){
			rr = x
			bb = c
		}else{
			rr = c 
			bb = x
		}
		
		r = (rr+m)*255
		g = (gg+m)*255
		b = (bb+m)*255
		
		return [r, g, b]
		
	}
	
	function all(list, func){
		return list.reduce(function(x, y){return x && func(y)}, true)
	}
	
	function round(num, digits){
		var p10 = Math.pow(10, digits)
		return Math.floor(p10*num)/p10 
	}
	
	function hex(num, pad){
		var op = num.toString(16)
		
		while(pad > op.length){
			op = '0' + op 
		}
		
		return op
	}

	function colorize(r, g, b){
		return '#' + hex(Math.floor(r), 2) + hex(Math.floor(g), 2) + hex(Math.floor(b), 2)
	}
	
	function color_explode(color){
		var rgb = color.match(/[0-9a-fA-F]{2}/g)
		for(var i = 0; i < rgb.length; i++){
			rgb[i] = dec(rgb[i])
		}
		return rgb 
	}
	
	function dec(num){
		return parseInt(num, 16)
	}
	
	function icon(x, y, sheet, i, j){
		var tw = 32 
		pixel.context.drawImage(pixel.imgs[sheet], tw*i, tw*j, tw, tw, x, y, tw, tw)
	}
	
	function none(){}
	
	function initialize(that, options, defaults){
		for(var i in defaults){
			if(defaults.hasOwnProperty(i)){
				that[i] = options[i] === undefined ? defaults[i] : options[i]
			}
		}
	}
	
// Mode 
	function Mode(){
		this.drawables = []
	}
	
	Mode.prototype.add = function(frame){
		this.drawables.push(frame)
	}
	
	Mode.prototype.draw = function(){
		for(var i = 0; i < this.drawables.length; i++){
			this.drawables[i].draw()
		}
	}
	
	Mode.prototype.update = function(){
		for(var i = 0; i < this.drawables.length; i++){
			this.drawables[i].update()
		}
	}
	
	Mode.prototype.activate = function(){
		pixel.context.clearRect(0, 0, pixel.canvas.width, pixel.canvas.height)
		for(var i = 0; i < this.drawables.length; i++){
			this.drawables[i].first_time = this.drawables[i].changed = true 
		}
		pixel.mode = this 
	}

// Memory
	function Memory(){
		this._memory = []
		this._set = []
		this.t = 0 
		this.pausing = false 
		//this.verbose = true 
		this.color_set_mode = false 
		
		this.max_memories = 50 // 1/0
		
	}
	
	Memory.prototype.start_set = function(){
		//log('Start Set')
		if(this.pausing) return 
		
		if(this.color_set_mode){
			//log('color break: start_set')
			this.end_set()
		}
		
		if(this._set.length){
			this.t += 1
			this._memory.push(this.clean(this._set))
		}
		this._set = []
		this.setting = true 
	}
	
	Memory.prototype.end_set = function(){
		//log('End Set ' + this._set.length)
		//throw('end')
		if(this.pausing) return 
		this.color_set_mode = false 
		
		if(this._set.length){
			this.t += 1
			this._memory.push(this.clean(this._set))
		}
		//log('end set ' + this._set.length)
		this._set = []
		this.setting = false 
	}
	
	Memory.prototype.clean = function(set){
		// Cleans up sets to save memory 
		if(set.length > 1){
			//if(set.reduce(function(x, y){return x && y.flavor === 'slide change'}, true)){
			if(all(set, function(e){return e.flavor === 'slide change'})){
				var e = {
					flavor: 'slide change',
					old_slide: set[0].old_slide,
					new_slide: set[set.length-1].new_slide
				}
				log('Reduced set of length ' + set.length)
				set = [e]
			}
			if(all(set, function(e){return e.flavor === 'color change'})){
				
				var e = set[0]
				var last = set[set.length-1]
				
				e.new_color = last.new_color 
				log('Reduced set of length ' + set.length)
				set = [e]
			}
			
		}
		return set 
		
	}
	
	Memory.prototype.add = function(event){
		if(this.pausing) return 

		
		this._memory = this._memory.slice(0, this.t)
		//this._memory = this._memory.slice(this._memory.length - this.max_memories, this._memory.length)
		if(this._memory.length >= this.max_memories){
			this._memory.shift()
			this.t -= 1 
			log('Forgotten Memory')
		}
		
		if(this.color_set_mode){
			if(event.flavor !== 'color change' || event.color !== this.color_set_mode){
				this.end_set()
			}
		}
		
		if(event.flavor ===  'color change'){
			this.color_set_mode = event.color  
			this._set.push(event)
		}else if(this.setting){
			this._set.push(event)
		}else{
			this.t += 1
			this._memory.push([event])
		}
		//log([this.t, this._memory.length])
	}
	
	Memory.prototype.undo = function(){
		if(this.color_set_mode){
			this.end_set()
		}
		this.t -= 1
		if(this.t < 0){
			this.t = 0
			return 
		}
//		log(this.t)
		//for(var i = 0; i < this._memory[this.t].length; i++){
		for(var i = this._memory[this.t].length - 1; i >= 0; i--){
			this.undo_event(this._memory[this.t][i])
		}
		//log([this.t, this._memory.length])
		
	}
	
	Memory.prototype.pause = function(){
		this.pausing = true
	}
	
	Memory.prototype.resume = function(){
		this.pausing = false 
	}
	
	Memory.prototype.redo = function(){
		
		if(this.t >= this._memory.length){
			this.t = this._memory.length
			return 
		}
		for(var i = 0; i < this._memory[this.t].length; i++){
			this.redo_event(this._memory[this.t][i])
		}
		this.t += 1 
	}
	
	Memory.prototype.redo_event = function(event){
		var message = ' '
		this.pause()
		
		if(event.flavor === 'paint'){
			event.slide.activate()
			event.tile.color = event.to_color
			pixel.sprite.changed = true 
		}else if(event.flavor === 'resize'){
			
			resizer.resize(event.new_rows, event.new_cols)
			pixel.sprite.changed = true 

			message = event.rows + ' -> ' + event.new_rows 
		}else if(event.flavor === 'slide change'){
			console.warn('Depricated: redo slide change')
			event.new_slide.activate(true)
			
			message = event.old_slide.id + ' -> ' + event.new_slide.id
		}else if(event.flavor === 'new slide'){
			pixel.timeline.drawables.push(event.new_slide)
			pixel.timeline.counter += 1 
			event.new_slide.activate(true)
		}else if(event.flavor === 'color change'){
			event.color.set(event.new_color)
		}else if(event.flavor === 'remove slide'){
			event.slide.remove()
		}else{
			console.log("Can't redo: " + event.flavor)
		}
		this.resume()

		if(this.verbose) log('redo: ' + event.flavor + message)
	}
	
	Memory.prototype.undo_event = function(event){
		var message = ''
		this.pause()
		if(event.flavor === 'paint'){
			event.slide.activate()
			event.tile.color = event.from_color 
			pixel.sprite.changed = true 
			
		}else if(event.flavor === 'resize'){
			resizer.resize(event.old_rows, event.old_cols,)
			pixel.sprite.changed = true 

			message = event.rows + ' -> ' + event.new_rows 
			
		}else if(event.flavor === 'slide change'){
			console.warn('Depricated: undo slide change')
			event.old_slide.activate(true)
			
			message = event.old_slide.id + ' -> ' + event.new_slide.id
			
		}else if(event.flavor === 'new slide'){
			
			pixel.timeline.remove(event.new_slide)
			event.old_slide.activate(true)
			
		}else if(event.flavor === 'color change'){
			event.color.set(event.old_color)
		}else if(event.flavor === 'remove slide'){
			event.slide.resurrect()
		}else{
			console.log("Can't undo: " + event.flavor)
		}
		this.resume()
		
		if(this.verbose) log('undo: ' + event.flavor + ' ' + message)
	}
	
	
// Frame 
	function Frame(x, y, width, height, mode){
		this.x = x 
		this.y = y 
		this.width = width 
		this.height = height 
	
		this.reset()
		
		//pixel.drawables.push(this)
		mode.add(this)
	}
	
	Frame.prototype.remove = function(el){
		var index = this.drawables.indexOf(el)
		if(index === -1){
			return false 
		}else{
			this.drawables.splice(index, 1)
			this.counter -= 1 
			return true 
		}
	}
	
	Frame.prototype.reset = function(){
		this.counter = 0
		this.drawables = [] 
		this.first_time = true 
		this.messages = []

	}
	
	Frame.prototype.adopt = function(drawables){
		this.reset()
		this.drawables = drawables 
		this.counter = drawables.length 
	}
	
	Frame.prototype.add = function(Constructor, arg){
		var obj = new Constructor(this.counter++, this, arg)
		this.drawables.push(obj)
		return obj 
		
	}
	
	Frame.prototype.draw = function(){
		if(this.first_time || this.clean){
			pixel.context.strokeStyle = GREY
			pixel.context.lineWidth = '1';
			pixel.context.strokeRect(this.x, this.y, this.width, this.height)
			//pixel.context.stroke()
			pixel.context.fillStyle = BLACK
			pixel.context.fillRect(this.x, this.y, this.width, this.height)
			this.first_time = false 
		}
		
		for(var i =0; i < this.drawables.length; i++){
			this.drawables[i].draw()
		}
		
		
		if(this.messages && this.messages.length){
			var height = 15
			pixel.context.font = height + "px monospace"
			pixel.context.textBaseline = 'top'
			for(var i = 0; i < this.messages.length; i++){
				var x = this.x + 1 
				var y = this.y + 1 + i * height
				if(y > this.height){
					break 
				}
				var message = this.messages[i]
				pixel.context.clearRect(x, y, this.width - 2, height)
				pixel.context.fillStyle = WHITE
				pixel.context.fillText(message, x, y)
			}
			this.messages = [] 
		}
		

		
	}
	
	Frame.prototype.get_by_coords = function(obj){
		for(var i = 0; i < this.drawables.length; i++){
			var t = this.drawables[i]
			if(t.hit && t.hit(obj)){
				return t 
			}
		}
		return undefined
	}
	
	Frame.prototype.deactivate_all = function(){
		for(var i =0; i < this.drawables.length; i++){
			this.drawables[i].active = false 
		}
	}
	
	Frame.prototype.update = function(){
		for(var i =0; i < this.drawables.length; i++){
			if(this.drawables[i].update){
				this.drawables[i].update()
			}
			if(this.changed){
				this.drawables[i].changed = true 
			}
		}
	}
	
	Frame.prototype.log = function(){
		s = ''
		for(var i = 0; i < arguments.length; i++){
			var arg = arguments[i] 
			if(typeof arg === 'number'){
				s += round(arg, 1)
			}else{
				s += arg
			}

			
			s += '\n'
		}
		var words = s.split(' ')
		var buff = 1
		var word
		if(this.font) pixel.context.font = this.font 
		var hh = pixel.context.font.match(RE_FONT_SIZE)
		var h = hh ? (+hh[1]) + 2*buff : TW*2
		var x = y = 0 
		pixel.context.textBaseline = 'top'
		pixel.context.textAlign = 'left'
		pixel.context.fillStyle = GREY
		for(var i = 0; i < words.length; i++){
			word = ' ' + words[i]
			w = pixel.context.measureText(word).width 
			if(x + w > this.width){
				x = 0
				y += h 
				if(y + h >= this.height){
					break 
				}
				
			}
			pixel.context.fillText(word, this.x + x, this.y + y)
			x += w 
		}
	}
	

// Label 
	function Label(id, frame, options){
		this.id = id 
		this.frame = frame 
		initialize(this, options, {
			x: 0,
			y: 0,
			font: '15px monospace',
			textBaseline: 'top',
			textAlign: 'left',
			fillStyle: 'white',
			text: '???',
			globalAlpha: .3,
		})
		/*
		for(var i in defaults){
			this[i] = options[i] === undefined ? defaults[i] : options[i]
		}*/
		
		this.x += this.frame.x 
		this.y += this.frame.y 
		this.changed = true 
	}
	
	Label.prototype.draw = function(){
		if(this.changed){
			var vals = ['textAlign', 'textBaseline', 'fillStyle', 'globalAlpha', 'font']
			for(var i = 0; i < vals.length; i++){
				pixel.context[vals[i]] = this[vals[i]]
			}
			
			// The following doesn't take into acount textAlign != left or textBaseline != top and therefore is buggy 
			var buff = 1 
			var w = pixel.context.measureText(this.text).width
			var hh = this.font.match(RE_FONT_SIZE)
			var h = hh ? (+hh[1]) + 2*buff : TW*2
			
			pixel.context.fillStyle = 'black'
			pixel.context.fillRect(this.x, this.y, w, h)
			
			pixel.context.fillStyle = this.fillStyle
			pixel.context.fillText(this.text, this.x, this.y)
			pixel.context.globalAlpha = 1
		}
		this.changed = false 

	}
	
	
// Tile
	function Tile(id, frame, options){

		this.frame = frame 
		this.id = id 
		var tw = options.tw 
		
		var xbuff = (frame.width - tw*options.cols)/2
		var ybuff = (frame.height - tw*options.rows)/2
		
		this.y = ybuff + this.frame.y + tw*Math.floor(id / options.cols)

		this.x = xbuff + this.frame.x + tw*(id % options.cols)
		
		this.rows = frame.rows 
		this.cols = frame.cols 
		
		this.width = this.height = tw 
		this.color = undefined
		this.border = BORDER 
		this.changed = true 
		this.dead = false 
	}
	
	Tile.prototype.draw = function(){
		if(this.dead) return 
		
		if(this.changed){
			pixel.context.clearRect(this.x,this.y,this.width,this.height)
			if(this.color){
				//console.log(this.color)
				pixel.context.fillStyle = this.color.get()
			}else{
				pixel.context.fillStyle = pixel.transparency //transparent
			}
			
			
			pixel.context.fillRect(this.x,this.y,this.width,this.height)
			
			if(this.active){
				//log(this.id)
				var c = this.active.match ? this.active.match(RE_COLOR) : false 
				
				pixel.context.strokeStyle = c ? '#' + c[1] : this.border
				pixel.context.lineWidth = 1
				pixel.context.strokeRect(this.x+1, this.y+1, this.width-2, this.height-2)
				//this.active = false 
				//this.changed = true 
			}
		}
		
	}
	
	Tile.prototype.update = function(){
		this.changed = false 
		
		if(this.rows !== this.frame.rows || this.cols !== this.frame.cols){
			this.reorganize()
		}
		if(this.dead){
			return 
		}
		if(this.hit(mouse)){
			this.active = true 
			this.changed = true 
			if(mouse.down){
				this.onclick()
			}
		}else{
			if(this.active !== BLUE){
				this.active = false 
				this.changed = true 
			}
		}
	}
	
	Tile.prototype.reorganize = function(){
		
		var frame = this.frame 
		var tw = frame.width/frame.cols 
		
		var total_width = MAX_ROWS * tw 
		var total_height = MAX_COLS * tw 
		
		var xbuff = (total_width - frame.width)/2
		var ybuff = (total_height - frame.height)/2
		
		this.y =  this.frame.y - ybuff + tw*Math.floor(this.id / MAX_COLS)

		this.x = this.frame.x - xbuff + tw*(this.id % MAX_COLS)
		
		this.rows = frame.rows 
		this.cols = frame.cols 
		
		this.width = this.height = tw 
		
		this.changed = true 
		this.dead = !(this.x >= frame.x && this.x < frame.x + frame.width && this.y >= frame.y && this.y < frame.y + frame.height)
	}
	
	Tile.prototype.onclick = function(){
		mouse.use(this)
	}
	
	Tile.prototype.hit = function(obj){
		if(obj.x === undefined || obj.y === undefined){
			console.warn('Not implemented')
		}else if(obj.width === undefined || obj.height === undefined){
			return this.x < obj.x && obj.x <= this.x + this.width && this.y < obj.y && obj.y <= this.y + this.height
		}else{
			
			console.warn('Not implemented')
		}
	}
	
	Tile.prototype.get_neighborhood = function(){
		var hood = [this]
		var changed = true 
		var contains = function(list, el){return list.indexOf(el) > -1}
		
		while(changed){
			//log('hood, grow!')
			changed = false 
			for(var i = 0; i < hood.length; i++){
				var h = hood[i]
				var vns = h.get_vn_neighbors()
				for(var j = 0; j < vns.length; j++){
					var n = vns[j] 
					if(n.color === this.color){
						if(!contains(hood, n)){
							hood.push(n)
							changed = true 
						}
					}else{
						//log([n.color, this.color])
					}
				}
			}
		}
		return hood 
		//return this.get_vn_neighbors()
		
	}
	
	Tile.prototype.get_vn_neighbors = function(){
		var hood = []
		var pow = Math.pow 
		//log([this.x, this.y])
		for(var n = 0; n < 4 ; n++){
			// Stupid Math Magic 
			var x = (pow(n-1.5,3) - .25*(n-1.5))/3
			var y = pow(n-1.5,3) - 2.25*(n-1.5)
			
			var m = {
				x: this.x + x*this.width + this.width/2, 
				y: this.y + y*this.height + this.height/2
			}
			
			var neighbor = this.frame.get_by_coords(m)
			
			if(neighbor){
				hood.push(neighbor)
			}

		}
		//log('hood size: ' + hood.length)
		return hood 
		
	}
	
	
// Slide 
	function Slide(id, frame){
		this.id = id 
		this.frame = frame 
		
		this.width = this.height = frame.height 
		this.y = this.frame.y 
		this.x = this.frame.x + this.frame.height*id 
		this.colors = [] 

		this.activate()
		
		this.t = 	0
		this.update()
	}
	
	Slide.prototype.activate = function(){
		var e = {
			flavor: 'slide change',
			old_slide: pixel.active_slide,
			new_slide:this 
		}
		
		if(pixel.active_slide){
			pixel.active_slide.refresh()
			pixel.active_slide.active = false 
			if(e.new_slide !== e.old_slide){
				//pixel.memory.add(e)
			}
			
		}
		this.active = true 
		this.t = 1
		pixel.active_slide = this 
		
		this.copy_old_colors()
		
		pixel.sprite.changed = true 
	}
	
	Slide.prototype.copy_old_colors = function(){
		for(var i = 0; i < this.colors.length; i++){
			pixel.sprite.drawables[i].color = this.colors[i]
		}
	}
	
	Slide.prototype.remove = function(){
		if(this.frame.drawables.length === 1){
			return 
		}
		log('Remove Slide ' + this.id)
		var index = this.frame.drawables.indexOf(this)
		if(index !== this.id){
			console.log('bad id: ' + index + ' ' + this.id)
		}
		this.frame.drawables.splice(index, 1)
		for(var i = index; i < this.frame.drawables.length; i++){
			this.frame.drawables[i].id = i 
		}
		if(index < this.frame.drawables.length){
			this.frame.drawables[index].activate()
		}else{
			this.frame.drawables[0].activate()
		}
		
		pixel.memory.add({
			flavor: 'remove slide',
			slide: this
		})
		
		this.frame.counter -= 1
		
	}
	
	Slide.prototype.resurrect = function(){
		this.frame.drawables.splice(this.id, 0, this)
		for(var i = this.id; i < this.frame.drawables.length; i++){
			this.frame.drawables[i].id = i 
		}
		this.activate()
		this.frame.counter += 1 
	}
	
	Slide.prototype.update = function(){
		if(this.t <= 0){
			this.t = 30
			this.refresh()
		}else{
			this.t -= 1 
		}
		
		var this_area = this.width * this.height * this.frame.drawables.length 
		var frame_area = this.frame.width * this.frame.height
	
		if(this_area > frame_area){ 
			this.width *= .5
			this.height = this.width 
			this.activate()
		}else if(this_area * 4 <= frame_area && this.height < this.frame.height){
			this.width *= 2
			this.height = this.width 
			this.activate()
		}
		
		// Account for too small 
		
		this.x = this.frame.x + (this.id * this.width) % this.frame.width 
		this.y = this.frame.y +this.height * Math.floor((this.id * this.width)/this.frame.width)
		
		if(mouse.clicked && this.hit(mouse)){
			this.activate()
		}
	}
	
	Slide.prototype.draw = function(){
		if(!(this.x >= this.frame.x && this.x + this.width <= this.frame.x + this.frame.width && this.y >= this.frame.y && this.y + this.height <= this.frame.y + this.frame.height)){
			return 
		}

		var buff 
		if(this.active){
			pixel.context.fillStyle = WHITE
			buff = 2
		}else{
			pixel.context.fillStyle = GREY 
			pixel.context.globalAlpha = .5
			buff = 1
		}
		
		pixel.context.fillRect(this.x, this.y, this.width, this.height)
		pixel.context.clearRect(this.x + buff, this.y + buff, this.width - 2*buff, this.height - 2*buff)
		
		if(this.img){
			
			pixel.context.drawImage(this.img, this.x, this.y)
		}
		pixel.context.globalAlpha = 1

		
	}
	
	Slide.prototype.refresh = function(){
		if(!this.active){
			return 
		}
		
		this.colors = pixel.sprite.drawables.map(function(x){return x.color})
		
		this.img = this.to_img(this.width / pixel.sprite.cols)
		
		
	}
		
	Slide.prototype.to_img = function(tw, onload){
		var canvas = document.createElement('canvas')
		var context = canvas.getContext('2d')
		
		canvas.width = tw * pixel.sprite.cols 
		canvas.height = tw * pixel.sprite.rows 
		
		 
		
		var i, x, y
		i = x = y = 0 
		
		while(y < canvas.height && i < this.colors.length){
			var t = pixel.sprite.drawables[i]
			var color = this.colors[i]
			if(!t.dead){
				if(color){
					context.fillStyle = color.get()
					context.fillRect(x, y, Math.ceil(tw), Math.ceil(tw))
				}
				x += tw 
				if(x >= canvas.width){
					x = 0 
					y += tw 
				}
				if(y >= canvas.height){
					still_working = false 
				}
			}
			i += 1
		}
		
		img = new Image()
		img.src = canvas.toDataURL('image/png')
		if(onload) img.onload = onload
		
		return img 
	}
	
	Slide.prototype.hit = Tile.prototype.hit 

// Button 
	function Button(id, frame, options){
		if(options === undefined) options = {}
		
		this.id = id 
		this.frame = frame 
		this.label = ' ' + (options.label || '????') + ' '
		this.icon = options.icon 
		this.font = options.font || '28px monospace'
		
		
		this.callback = options.callback || none 
		this.logger = options.logger 
		this.description = options.description
		if(this.icon){
			this.width = this.height = TW* 2 
		}else{
			var buff = 2
			var h = this.font.match(RE_FONT_SIZE)
			this.height = h ? (+h[1]) + 2*buff : TW*2
			this.width = Math.max(pixel.context.measureText(this.label).width + 2*buff, TW*2)
			pixel.context.font = this.font 
			this.width = pixel.context.measureText(this.label).width
			//log(this.width)
			//this.width = TW*2
		}
		if(options.x === undefined){
			this.x = this.frame.x + (this.id*this.width) % this.frame.width
		}else{
			this.x = this.frame.x + options.x 
		}
		
		if(options.y === undefined){
			this.y = this.y = this.frame.y + this.width*Math.floor((this.id*this.width)/this.frame.width)
		}else{
			this.y = this.frame.y + options.y
		}
		
		this.active = options.active 
		this.disable = options.disable || none 
		this.disabled = false 
		
		if(options.centered){
			this.x -= this.width/2
		}
		
	}
	
	Button.prototype.hit = Tile.prototype.hit 
	
	Button.prototype.activate = function(){
			if(mouse.active_button){
				mouse.active_button.active = false 
			}
			mouse.active_button = this 
			this.active = true 
	}
	
	Button.prototype.update = function(){
		this.disabled = this.disable()
		
		var hover = this.hit(mouse)
		
		if(mouse.clicked && hover && !this.disabled){
			this.chosen = true 
		}
		if(!mouse.down && this.chosen){
			if(hover){
				this.callback()
			}
			this.chosen = false 
		}
		
		if(hover && this.logger && this.description){
			this.logger.log(this.description)
		}
	}
	
	Button.prototype.draw = function(x, y){
		if(x) this.x = x 
		if(y) this.y = y 
		
		if(this.active){
			pixel.context.globalAlpha = 1
		}else if(this.disabled){
			pixel.context.globalAlpha = .05
		}else if(this.hit(mouse)){
			pixel.context.globalAlpha = .8
		}else{
			pixel.context.globalAlpha = .3 
			
		}
		
		pixel.context.clearRect(this.x, this.y, this.width, this.height)
		pixel.context.strokeStyle = WHITE 
		
		
		
		
		/*
		pixel.context.fillRect(this.x, this.y, this.width, this.width)
		pixel.context.fillStyle = 'black'
		pixel.context.fillRect(this.x + 1, this.y + 1, this.width - 2, this.width - 2)
		*/
		if(this.icon){
			try{
				icon(this.x, this.y, this.icon.sheet, this.icon.i, this.icon.j)
			}catch (e){
				this.icon = undefined
			}
			
		}else{
			//pixel.context.strokeRect(this.x, this.y, this.width, this.height)
			var buff = 2 
			var alpha = pixel.context.globalAlpha
			
			pixel.context.fillStyle = WHITE
			pixel.context.fillRect(this.x + 1, this.y, this.width - 2, this.height)
			pixel.context.globalAlpha = 1 
			pixel.context.fillStyle = 'black'
			pixel.context.fillRect(this.x + buff + 1, this.y + buff, this.width - 2 * buff - 2, this.height - 2 * buff)
			pixel.context.globalAlpha = alpha 
			pixel.context.fillStyle = WHITE
			pixel.context.font = this.font 
			pixel.context.textBaseline = 'middle'
			pixel.context.textAlign = 'center'
			pixel.context.fillText(this.label, this.x + this.width/2, this.y + this.height/2)
		}
		
		pixel.context.globalAlpha = 1 
		
	}
	
// Color 
	function Color(id, frame, color){
		this.frame = frame 
		this.id = id 
		this.x = this.frame.x + (this.id*TW) % this.frame.width
		this.y = this.frame.y + TW*Math.floor((this.id*TW)/this.frame.width)
		this.width = TW 
		this.height = TW 
		//this.color = color
		this.border = BORDER 
		this.changed = true 
		this.dead = false 
		
		this.color = pixel.message.add(ColorHUD, color)

	}
	
	Color.prototype.draw = Tile.prototype.draw 
	Color.prototype.update = Tile.prototype.update
	Color.prototype.hit = Tile.prototype.hit 
	
	Color.prototype.get = function(){
		return this.color.get()
	}
	
	Color.prototype.onclick = function(){
		mouse.color = this 
		mouse.adjust_alpha = false 
		//mouse.color_hud = this.color  
		this.changed = true 
		//console.log('click: color')
	}
	
// HSV
	function HSV(color, parent){
		this.set(color)
		this.memorable = 'color'
		this.grandparent = parent 
	}
	
	HSV.prototype.get = function(){
		return colorize.apply(this, hsv_to_rgb([this.hue, this.saturation, this.value]))
	}
	
	HSV.prototype.set = function(color){
		var hsv = rgb_to_hsv(color_explode(color))
		this.hue = hsv[0]
		this.saturation = hsv[1]
		this.value = hsv[2]
	}
	
	HSV.prototype.update = function(){
		this.changed = this.hue !== this.old_h || this.saturation !== this.old_s || this.value !== this.old_v 
		//log(this.changed)
		this.old_h = this.hue
		this.old_s = this.saturation
		this.old_v = this.value 
	}
	
	
// Color HUD
	function ColorHUD(id, frame, color){
		var rgb = color.match(/[0-9a-fA-F]{2}/g)
		this.hsv = new HSV(color, this)
		var colors = ['red', 'green', 'blue', 'hue', 'saturation', 'value']
		var maxes = [255, 255, 255, 359, 1, 1]
		this.sliders = []
		
		for(var i = 0; i < colors.length; i++){
			var c = colors[i]
			this[c] = dec(rgb[i])
			this.sliders.push(new Slider({
				parent: i < 3 ? this : this.hsv, 
				prop:c, 
				label: c[0].toUpperCase(), 
				min: 0, 
				max: maxes[i],
				logger: pixel.tool_tips,
				message: 'Adjust ' + c + ' level.',
				vertical: true,
				width: 5*TW,
				preprocess: i < 4 ? Math.floor : function(x){return x} 
			}))
		}
		
		this.frame = frame 
		this.square_width = this.frame.height - 3*TW 
		this.x = this.frame.x + TW
		this.y = this.frame.y + TW 
		
		this.memorable = 'color'
		
	}
	
	ColorHUD.prototype.floor = function(){
		var colors = ['red', 'green', 'blue']
		for(var i = 0; i < colors.length; i++){
			var c = colors[i]
			this[c] = Math.max(0, Math.floor(this[c]))
		}
	}
	
	ColorHUD.prototype.get = function(){
		this.floor()
		return colorize(this.red, this.green, this.blue) //'#' + hex(this.red, 2) + hex(this.green, 2) + hex(this.blue, 2)
	}
	
	ColorHUD.prototype.set = function(color){
		var rgb = color_explode(color)
		this.red = rgb[0]
		this.green = rgb[1]
		this.blue = rgb[2]
	}
	
	ColorHUD.prototype.draw = function(){
		//console.log(this.get())
		if(mouse.color.color === this){
			var w = this.square_width 
			
			pixel.context.clearRect(this.frame.x, this.frame.y, this.frame.width, this.frame.height)
			pixel.context.fillStyle = this.get()
			pixel.context.fillRect(this.x, this.y, w, w)
			
			
			for(var i = 0; i < this.sliders.length; i++){
				//this.sliders[i].draw(this.frame.x + w + 10 + TW, this.frame.y + 24 + i*24) // Horizontal
				this.sliders[i].draw(this.frame.x + w + 1.5*TW*i + 3*TW, this.frame.y + 6*TW) // Vertical
			}
			pixel.context.fillStyle = this.hover ? WHITE : GREY 
			pixel.context.textBaseline = 'top'
			pixel.context.textAlign = 'left'
			pixel.context.fillText(this.get(), this.x, this.y + w)
		}
		
	}
	
	ColorHUD.prototype.update = function(){
		if(mouse.color.color === this){
			for(var i = 0; i < this.sliders.length; i++){
				this.sliders[i].update()
			}
			this.hsv.update()
			if(this.hsv.changed){
				this.set(this.hsv.get())
				this.changed = true 
			}
			if(this.changed){
				pixel.palette.changed = true 
				pixel.sprite.changed = true 
				this.changed = false 
			}
			this.hsv.set(this.get())
			
			
			var w = this.square_width
			this.hover = mouse.x > this.x && mouse.x <= this.x + w && mouse.y > this.y + w && mouse.y < this.y + w + TW
			if(mouse.down && this.hover){
				var a = this.parse_color(prompt("Pick a color"))
				if(a){
					pixel.memory.add({
						flavor: 'color change',
						old_color: this.get(),
						color: this,
						new_color: a 
					})
					this.set(a)
					this.changed = true 
				}
				mouse.down = false 
			}
			
			
			if(this.hover){
				pixel.tool_tips.log('Click to manually enter color.')
			}
		}
	}
	
	ColorHUD.prototype.parse_color = function(color){
		if(color && color.match){
			var match = color.match(RE_COLOR)
			if(match){
				return '#' + match[1]
			}
		}
		return undefined
	}
		
		
// Alpha 
	function Alpha(id, frame, color){
		this.frame = frame 
		this.id = id 
		this.x = this.frame.x + (this.id*TW) % this.frame.width
		this.y = this.frame.y + TW*Math.floor((this.id*TW)/this.frame.width)
		this.width = TW 
		this.height = TW 
		//this.color = color
		this.border = BORDER 
		this.changed = true 
		this.alpha = true 
		
		this.color = pixel.message.add(AlphaHUD, color)
	}
	
	Alpha.prototype = Object.create(Color.prototype)
	
	Alpha.prototype.draw = function(){
		Color.prototype.draw.call(this)
		
		pixel.context.strokeStyle = 'red'
		pixel.context.lineWidth = 1 
		pixel.context.strokeRect(this.x, this.y, this.width, this.height)
		pixel.context.beginPath()
		pixel.context.moveTo(this.x, this.y)
		pixel.context.lineTo(this.x + this.width, this.y + this.height)
		pixel.context.stroke()
	}
	
	
// AlphaHUD 
	function AlphaHUD(id, frame, color){
		ColorHUD.call(this, id, frame, color)
	}
	
	AlphaHUD.prototype = Object.create(ColorHUD.prototype)
	
	AlphaHUD.prototype.update = function(){
		ColorHUD.prototype.update.call(this)
		pixel.transparency = this.get()
	}
	
	AlphaHUD.prototype.draw = function(){
		ColorHUD.prototype.draw.call(this)
		if(mouse.color.color === this){
			var x = this.x + this.square_width/2
			var y = this.y + this.square_width/2
			pixel.context.save()
			pixel.context.translate(x, y)
			pixel.context.rotate(Math.PI/4)
			pixel.context.strokeStyle = BLACK
			pixel.context.fillStyle = WHITE
			pixel.context.lineWidth = 2 
			pixel.context.textAlign = 'center'
			pixel.context.textBaseline = 'middle'
			pixel.context
			pixel.context.strokeText('TRANSPARENT', 0, 0) // 0, 0 Because of translate(x, y)
			pixel.context.fillText('TRANSPARENT', 0, 0)
			pixel.context.textAlign = 'left'
			pixel.context.restore()
		}
		
	}
	
			
// Slider
	//function Slider(parent, prop, label, min, max, width){
	function Slider(options){
		
		initialize(this, options, {
			parent: undefined,
			prop: undefined,
			min: 0,
			max: 100,
			label: '?',
			width: 100,
			nob_size: 3,
			logger: undefined,
			message: undefined,
			vertical: false,
			preprocess: Math.floor
		})
	}
	
	Slider.prototype.update = function(){
		var buff = 5
		
		if(this.vertical){
			this.hover = this.y + buff > mouse.y && mouse.y > this.y - this.width - buff && Math.abs(this.x - mouse.x) < 3*this.nob_size
			//if(this.label === 'R')
				//log([this.label, this.y + buff <mouse.y])// , mouse.y < this.y + this.width - buff , Math.abs(this.x - mouse.x) < 3*this.nob_size])
		}else{
			this.hover = this.x - buff < mouse.x && mouse.x < this.x + this.width + buff && Math.abs(this.y - mouse.y) < 3*this.nob_size
		}
		
		if(this.hover){
			if(mouse.down){
				if(this.parent.memorable){
					var e = {
						flavor: this.parent.memorable + ' change'
					}
					e['old_' + this.parent.memorable] = this.parent.get()
					e[this.parent.memorable] = this.parent.grandparent ? this.parent.grandparent : this.parent
					
				}
				
				if(this.vertical){
					
					var x = (this.y - mouse.y)/this.width 
 
				}else{
					var x = (mouse.x - this.x)/this.width 
		
				}
				var y = (this.max - this.min)*x + this.min 
				y = Math.min(this.max, y)
				y = Math.max(this.min, y)
				this.parent[this.prop] = this.preprocess(y)
				this.parent.changed = true 
				
				//log(this.parent[this.prop] + ' ' + this.prop) 
				//log(this.parent)
				
				if(this.parent.memorable){
					e['new_' + this.parent.memorable] = this.parent.get()
					pixel.memory.add(e)
				}
				
			}
			if(this.logger && this.message){
				//log(this.message)
				this.logger.log(this.message)
			}
		}
	}
	
	Slider.prototype.draw = function(x, y){
		
		var context = pixel.context 
		context.fillStyle = context.strokeStyle = this.hover ? WHITE : GREY  
		
		context.font = '15px monospace'
		context.textBaseline = 'middle'
		context.fillText(this.label, x, y)
		
		
		if(this.vertical){
			
			y -=  5 + 5
			x += context.measureText(this.label).width/2
			
			this.x = x 
			this.y = y 
			
			//pixel.tools.log(this.label, this.parent[this.prop])
		
			context.beginPath()
			context.lineWidth = 2
			context.moveTo(x, y)
			context.lineTo(x, y-this.width)
			context.stroke()
			
			
			
			var nob_y = y - this.width*((this.parent[this.prop])/(this.max - this.min) - this.min/(this.max - this.min))
			var w = this.nob_size 
			
			
			context.fillRect(x - w, nob_y - w, 2*w, 2*w)
			//log([x, y - w - nob_y, 2*w, 2*w])
		
			context.stroke()
		}else{
			x +=  5 + context.measureText(this.label).width
			
			this.x = x 
			this.y = y 
			
			//pixel.tools.log(this.label, this.parent[this.prop])
		
			context.beginPath()
			context.lineWidth = 2
			context.moveTo(x, y)
			context.lineTo(x+this.width, y)
			context.stroke()
			
			
			
			var nob_x = x + this.width*((this.parent[this.prop])/(this.max - this.min) - this.min/(this.max - this.min))
			var w = this.nob_size 
			
			
			context.fillRect(nob_x - w, y - w, 2*w, 2*w)
		
			context.stroke()
				
			}
		
		
		
	}
	
// SaveDialog 
	function SaveDialog(id, frame){
		this.id = id 
		this.frame = frame 
		this.x = frame.x 
		this.y = frame.y 
		this.width = frame.width 
		this.height = frame.height 
		
		this.counter = 0
		this.drawables = [] 
		this.tw = 4 
		this.file_type = 'png'
		
		var gap = .15
		this.add(Button, {
			label: 'CANCEL',
			callback: function(){pixel.modes.main.activate()},
			x: (.5+gap)*this.width,
			y : 200,
			centered: true
		})
		
		this.add(Button, {
			label: 'SAVE',
			callback: function(){
				this.frame.save()
			},
			x: (.5-gap)*this.width,
			y: 200,
			centered: true
		})
		
		var that = this 
		
		// Pixel Size 		
		this.add(Label, {
			x: TW,
			y: TW, 
			text: 'Pixel Size:',
			font: '20px monospace'
		})
		
		var px_butts = [] 
		
		function px_sizer(i){
			return function(){
				for(var j = 0; j < px_butts.length; j++){
					px_butts[j].active = false 
				}
				this.active = true 
				that.tw = i 
			}
		}
		
		for(var i = 1; i < 6; i ++){
			var butt = this.add(Button, {
				label: i + 'px',
				x: (6*TW*i - 4.5*TW),
				y: 3*TW,
				callback: px_sizer(i),
				active: i === this.tw 
			})
			
			px_butts.push(butt)
		}
		
		// File Type 
		this.add(Label, {
			x: TW,
			y: 6*TW, 
			text: 'File Type:',
			font: '20px monospace'
		})
		
		var type_butts = []
		function type_setter(type){
			return function(){
				that.file_type = type 
				
				for(var i = 0; i < type_butts.length; i++){
					log(i)
					type_butts[i].active = false 
				}
				this.active = true 
			}
		}
		var types = ['png', 'jpeg']
		for(var i = 0; i < types.length; i++){
			var butt = this.add(Button, {
				label: types[i],
				callback: type_setter(types[i]),
				x: (6*TW*i + 1.5*TW),
				y: 8*TW,
				active: types[i] === this.file_type 
			})
			type_butts.push(butt)
		}
		
	}
	
	SaveDialog.prototype.save = function(){
		var tw = this.tw 
		
		var canvas = document.createElement('canvas')
		var context = canvas.getContext('2d')
		canvas.width = pixel.sprite.cols * tw *  pixel.timeline.drawables.length 
		canvas.height = pixel.sprite.rows * tw 
		

		for(var i  = 0; i < pixel.timeline.drawables.length; i++){
			
			var slide = pixel.timeline.drawables[i]
			var img = slide.to_img(tw,
				 this.stamp(canvas, i, tw)
			)
		}
		
		pixel.modes.main.activate()
	}
	
	SaveDialog.prototype.stamp = function(canvas, i, tw){
		if(this.max_img_count){
			this.max_img_count += 1
		}else{
			this.max_img_count = 1
		}
		var that = this 
		
		return function(){
			var context = canvas.getContext('2d')
			if(that.file_type === 'jpeg'){
				context.fillStyle = pixel.transparency
				context.fillRect(i*this.width, 0, this.width, this.height)
			}
			context.drawImage(this, i*this.width, 0)
			if(that.img_count === undefined){
				that.img_count = 1 
			}else{
				that.img_count += 1
			}
			log(that.img_count +  '/' + that.max_img_count)
			if(that.img_count === that.max_img_count){
				var a = document.createElement('a')
				a.href = canvas.toDataURL('image/' + that.file_type)
				a.download = 'sprite.' + that.file_type
				// https://stackoverflow.com/questions/809057/how-do-i-programmatically-click-on-an-element-in-javascript
				var clickEvent = new MouseEvent("click", { 
					"view": window,
					"bubbles": true,
					"cancelable": false
				});
				a.dispatchEvent(clickEvent)
				//a.click()
				that.img_count = undefined
				that.max_img_count = 0 
			}
		}
	}
	
	SaveDialog.prototype.load = function(){
		// https://www.html5rocks.com/en/tutorials/file/dndfiles/
	}
	
	SaveDialog.prototype.draw = Frame.prototype.draw 
	SaveDialog.prototype.update = Frame.prototype.update 
	SaveDialog.prototype.add = Frame.prototype.add 
	
// mouse
	window. mouse = {
		x:0,
		y:0,
		down: false,
		clicked: false,
		color: 'red',//pico8[1],
		update: function(){
			this.clicked = false
		},
		use: undefined,
		release: undefined,
		on_up: function(){
			var frame = pixel.sprite 
			if(this.x >= frame.x && this.x <= frame.x + frame.width && this.y >= frame.y && this.y <= frame.y + frame.height){
				this.release()
			}
		},
		none: function(){},
		paint: function(t){
			if(this.clicked){
				pixel.memory.start_set()
			}
			this._paint_tile(t, this.color)
		},
		pick: function(t){
			if(t.color === undefined){
				this.color = pixel.alpha
			}else{
				this.color = t.color 
			}
			
		},
		paint_release: function(){
			pixel.memory.end_set()
		},
		erase: function(t){
			if(this.clicked){
				pixel.memory.start_set()
			}
			this._paint_tile(t, undefined)
		},
		_paint_tile: function(t, color){
			if(t.color === color || t.dead) return 
			if(color && color.alpha){
				this._paint_tile(t, undefined)
				return 
			}
			pixel.memory.add({
				flavor: 'paint',
				tile: t,
				from_color: t.color,
				to_color: color,
				slide: pixel.active_slide
			})
			t.color = color 
			t.changed = true 
		},
		rect: function(t){
			this.in_func = this.in_rect
			this.area(t)
		},
		circ: function(t){
			this.in_func = this.in_circ
			this.area(t)
		},
		area: function(t){
			if(this.clicked){
				this.start_area = t 
			}
			this.end_area = t 
			pixel.sprite.deactivate_all()
			this.do_to_area(function(t){t.active = BLUE})
		},
		do_to_area: function(f){
			var end = pixel.sprite.get_by_coords(this)
			var start = this.start_area
			var in_func = this.in_func 
			
			if(!start || !end){
				this.start_area = undefined
				return 
			}
			var x0 = Math.min(start.x, end.x)
			var y0 = Math.min(start.y, end.y)
			var x1 = Math.max(start.x, end.x)
			var y1 = Math.max(start.y, end.y)
			
			var func = in_func(x0, y0, x1, y1)
			//log(['xy',x0, y0, x1, y1])
			pixel.memory.start_set()
			for(var i = 0; i < pixel.sprite.drawables.length; i++){
				var t = pixel.sprite.drawables[i]
				if(func(t.x, t.y)){
					//log('do it ' + i )
					f(t)
					//this.paint(t)
				}
			}
			pixel.sprite.changed = true 
			pixel.memory.end_set()
			//this.start_area = undefined
		},
		area_release: function(){
			var that = this 
			function f(t){
				that.paint(t)
			}
			this.do_to_area(f)
			pixel.sprite.deactivate_all()
			this.start_area = undefined
		},
		in_circ: function(x0, y0, x1, y1){
			var h = (x1 + x0)/2
			var k = (y1 + y0)/2
			var a = x0 - h 
			var b =  y0 - k 
			
			//log(['hkab', h, k, a, b])
			
			return function(x, y){
				return Math.pow((x-h)/a, 2) + Math.pow((y-k)/b, 2) <= 1 
			
			}
		},
		in_rect: function(x0, y0, x1, y1){
			return function(x, y){
				return (x0 <= x && x <= x1 && y0 <= y && y <= y1)
			}
		},
		fill: function(t){
			if(!this.clicked){
				return 
			}
			pixel.memory.start_set()
			var hood = t.get_neighborhood()
			for(var i = 0; i < hood.length; i++){
				this._paint_tile(hood[i], this.color)
			}
			pixel.memory.end_set()
			pixel.sprite.changed = true 
			//log('filled ' + hood.length)
		}
	}
	
	
	window.onload = function(){
		pixel.canvas = document.createElement('canvas')
		pixel.canvas.width = WIDTH 
		pixel.canvas.height = HEIGHT 
		pixel.context = pixel.canvas.getContext('2d')
		document.body.appendChild(pixel.canvas)
		
		pixel.canvas.style.backgroundColor = 'black'
		
		var s = function(n){return TW*n}
		
		pixel.modes = {
			main: new Mode(),
			save: new Mode()
		}
		
		pixel.mode = pixel.modes.main 
		
		pixel.sprite = 	new Frame(s(1), s(1), s(20), s(20), pixel.modes.main)
		pixel.tools = 	new Frame(s(22), s(1), s(6), s(8), pixel.modes.main)
		pixel.palette = new Frame(s(22), s(18), s(17), s(3), pixel.modes.main)
		pixel.message = new Frame(s(22), s(10), s(17), s(7), pixel.modes.main)
		pixel.tool_tips = new Frame(s(29), s(1), s(10), s(8), pixel.modes.main)
		pixel.timeline = new Frame(s(1), s(22), s(25), s(5), pixel.modes.main)
		pixel.animation = new Frame(s(27), s(22), s(12), s(5), pixel.modes.main)
		
		var x_buff = 4
		var y_buff = 6
		pixel.save_frame = new Frame(s(x_buff), s(y_buff), s(40 - 2*x_buff), s(28 - 2*y_buff), pixel.modes.save)
		
		player.slider = new Slider({
			parent: player, 
			prop: 'fps', 
			label: 'FPS', 
			min: 1, 
			max: 30, 
			width: 120,
			logger: pixel.tool_tips,
			message: 'Adjust Animation Speed.'
		})
		
		pixel.timeline.clean = true 
		pixel.tool_tips.clean = true 
		
		pixel.memory = new Memory()
		
		pixel.canvas.addEventListener('mousemove', function(e){
			var rect = pixel.canvas.getBoundingClientRect()
			mouse.x = e.clientX - rect.left 
			mouse.y = e.clientY - rect.top
		})
		
		pixel.canvas.addEventListener('mousedown', function(e){
			mouse.down = true 
			mouse.clicked = true 
			//console.log('clicked')
		})
		
		pixel.canvas.addEventListener('mouseup', function(e){
			mouse.down = false 
			mouse.on_up()
		})
		
		
		pixel.imgs = {}
		var sheets = ['image', 'editor', 'content', 'toggle', 'action', 'av']
		for(var i = 0; i < sheets.length; i++){
			var img= new Image()
			//img.src = 'imgs/' + sheets[i] + '.png'
			img.src = 'https://raw.githubusercontent.com/google/material-design-icons/master/sprites/css-sprite/sprite-{{}}-white.png'.replace('{{}}', sheets[i])
			pixel.imgs[sheets[i]]  = img 
		}
		
		
		reset()
		tick()
		
	}
	
	var resizer = {
		get_old: function(){
			if(pixel.active_slide){
				return {
					colors: pixel.active_slide.colors,//.slice(),
					rows: pixel.active_slide.rows,
					cols: pixel.active_slide.cols 
				}
			}else{
				return {
					colors: pixel.sprite.drawables.map(function(x){return x.color}),
					rows: pixel.sprite.rows,
					cols: pixel.sprite.cols 
				}
			}
			
		},
		make_new_tiles: function(rows, cols){
			pixel.sprite.reset()
			var tile_count = rows*cols 
			var tw = Math.min(pixel.sprite.width/cols, pixel.sprite.height/rows)
			for(var i = 0; i < tile_count; i++){
				pixel.sprite.add(Tile, {tw:tw, rows:rows, cols:cols})
			}
			pixel.sprite.rows = rows 
			pixel.sprite.cols = cols 
		},
		resize: function(rows, cols){
			var e = {
				flavor: 'resize',
				old_rows: pixel.sprite.rows,
				old_cols: pixel.sprite.cols,
				new_rows: rows, 
				new_cols: cols
			}
			
			pixel.memory.start_set()
			pixel.sprite.rows = rows 
			pixel.sprite.cols = cols 
			pixel.sprite.changed = true 
			var cs = pixel.active_slide
			player.advance()
			while(cs !== pixel.active_slide){
				pixel.sprite.update()
				player.advance()
			}
			pixel.memory.add(e)
			pixel.memory.end_set()
			
			
		},
	}
	
	window. player = {
		fps: 15,
		t: 0,
		playing: false,
		
		update: function(){
			if(this.playing){
				//log(this.t)
				if(this.t >= 60 / this.fps){
					this.t = 0
					this.advance()
				}else{
					this.t += 1 
				}
			}
			this.slider.update()
		},
		advance: function(step){
			step = step === undefined ? 1 : step 
			
			var index = pixel.timeline.drawables.indexOf(pixel.active_slide)
			var n = pixel.timeline.drawables.length
			index = (((index + step) % n)+n)%n
			
			if(pixel.timeline.drawables[index]){ // Deals with startup shaniganery 
				pixel.timeline.drawables[index].activate()
			}
			
		},
		draw: function(){
			var x = pixel.animation.x + TW 
			var y = pixel.animation.y + 3.5*TW
			pixel.context.clearRect(x - TW/2, y - TW/2, pixel.animation.width - TW/2, TW)
			this.slider.draw(x, y)
		}
	}
	

	
	function reset(){
		resizer.make_new_tiles(MAX_ROWS, MAX_COLS)
		pixel.memory.pause()
		resizer.resize(20, 20)
		pixel.memory.resume()
		
		var special_colors = [
		[Alpha, '#242424'],
			[Color, '#ffffff'],
			[Color, '#000000']
			
		]
		var i = 0 
		for(var s = 1; s <= 1; s += .5){
			for(var v = 1; v > .3; v -= .325){ // 1 .75 .5
				for(var h = 0; h < 360; h += 360/16){
					var rgb = hsv_to_rgb([h, s, v])
				//	log([h,s,v] + ' -> ' + [rgb])
					
					if(h === 0){
						var c = pixel.palette.add(special_colors[i][0], special_colors[i][1])
						if(special_colors[i][0] === Alpha){
							pixel.alpha = c 
						}
						i++
					}
					var c = pixel.palette.add(Color, colorize.apply(this, rgb))
					
				}
			}
		}
		pixel.palette.drawables[1].onclick()
		
		function size(dir){
			player.playing = false 
			pixel.memory.end_set()
			
			var sizes = [8, 10, 16, 20, 32, 40]
			var current_size = pixel.sprite.rows 
			var i = sizes.indexOf(current_size) + dir 
			if(i >= sizes.length || i < 0){
				return 
			}else{
				resizer.resize(sizes[i], sizes[i])				
			}
		}
		
		var butts = [
			['paint', 'image', 4, 2, function(){
				this.activate()
				mouse.use = mouse.paint 
				mouse.release = mouse.paint_release				
			}, undefined, "Click to paint."],
			/*
			['erase', 'content', 1, 2, function(){
				this.activate()
				mouse.use = mouse.erase
				mouse.release = mouse.paint_release 
			}],*/
			['rect', 'toggle', 0, 0, function(){
				this.activate()
				mouse.use = mouse.rect 
				mouse.release = mouse.area_release //mouse.rect_release
			}, undefined, "Click and drag to create rectangle."],
			['circle', 'toggle', 2, 0, function(){
				this.activate()
				mouse.use = mouse.circ 
				mouse.release = mouse.area_release // mouse.circ_release 
			}, undefined, "Click and drag to create ellipse."],
			['fill', 'editor', 2, 4, function(){
				this.activate()
				mouse.use = mouse.fill
				mouse.release = mouse.none 
			}, undefined, "Click to fill in area."],
			['<undo', 'content', 6, 3, function(){
				pixel.memory.undo()
			}, function(){return pixel.memory.t === 0}, "Undo last action."],
			['>redo', 'content', 5, 1, function(){
				pixel.memory.redo()
			}, function(){return pixel.memory.t === pixel.memory._memory.length}, "Redo undone action."],
			['eye dropper', 'image', 0, 5, function(){
				this.activate()
				mouse.use = mouse.pick 
				mouse.release = none 
			}, undefined, 'Color picker tool.'],			
			['+grow', 'action', 3, 14, function(){
				size(-1)
			}, function(){return pixel.sprite.rows === 8}, 'Zoom in.'],
			['-shrink', 'action', 4, 14, function(){
				size(1)
			}, function(){return pixel.sprite.rows === MAX_ROWS}, 'Zoom out.'],
			['xclear', 'action', 3, 6, function(){
				pixel.memory.start_set()
				for(var i = 0; i < pixel.sprite.drawables.length; i++){
					mouse._paint_tile(pixel.sprite.drawables[i], undefined)
				}
				pixel.memory.end_set()
			}, undefined, 'Clear entire frame.'],
			['save', 'content', 3, 5, function(){
				pixel.modes.save.activate()
			}, undefined, 'Save sprite.']
		]
		
		for(var i = 0; i < butts.length; i++){
			var butt = pixel.tools.add(Button, {
				label: butts[i][0][0],
				icon: {
					sheet: butts[i][1],
					i: butts[i][2],
					j: butts[i][3]
				},
				callback: butts[i][4],
				disable: butts[i][5],
				logger: pixel.tool_tips,
				description: butts[i][6]
			})
			if(i === 0){ // Paintbrush On Load 
				butt.callback()
			}
		}
		
		var one_frame = function(){return pixel.timeline.drawables.length === 1}
		var anim_butts = [
			['+add', 'content', 1, 0, function(){
				var e ={
					flavor: 'new slide',
					old_slide: pixel.active_slide,
				}
				pixel.memory.start_set()
				e.new_slide = pixel.timeline.add(Slide)
				pixel.memory.add(e)
				pixel.memory.end_set()	
			}, undefined, 'Add animation frame.'],
			['[backward', 'av', 6, 7, function(){
				player.advance(-1)
			}, one_frame, 'Go to previous animation frame'],
			['>play', 'av', 6, 5, function(){
				player.playing = true 
				//pixel.memory.start_set()
			}, function(){return one_frame() || player.playing}, 'Play animation.'],
			['|pause', 'av', 0, 0, function(){
				player.playing = false 
				//pixel.memory.end_set()
			}, function(){return one_frame() || !player.playing}, 'Pause animation.'],
			[']forward', 'av', 5, 7, function(){
				player.advance()
			}, one_frame, 'Go to next animation frame.'],
			
			['xdelete', 'action', 4, 6, function(){
				pixel.active_slide.remove()
			}, one_frame, 'Delete active animation frame.'],
			
		]
		for(var i = 0; i < anim_butts.length; i++){
			var butt = pixel.animation.add(Button, {
				label: anim_butts[i][0][0],
				icon: {
					sheet: anim_butts[i][1],
					i: anim_butts[i][2],
					j: anim_butts[i][3]
				},
				callback: anim_butts[i][4],
				disable: anim_butts[i][5],
				logger: pixel.tool_tips,
				description: anim_butts[i][6]
			})
		}
		
		pixel.timeline.add(Slide)
		pixel.animation.drawables.push(player)
		
		pixel.save_frame.add(SaveDialog)
		
	}
	
	function draw(){
		pixel.mode.draw()
	}
	
	function update(){
		//pixel.canvas.width = pixel.canvas.width 
		pixel.mode.update()
		
		mouse.update()
		//pixel.dimensions.log(pixel.sprite.rows, pixel.sprite.cols)
	}
	
	function tick(t){
		var fps = 1000/(t - pixel._old_time)
		//pixel.timeline.log('FPS:', fps)
		draw()
		update()
		
		pixel._old_time = t
		window.requestAnimationFrame(tick);
	}
		
	return pixel

})()