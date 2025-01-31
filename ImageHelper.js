const { ImageData } = require("canvas")
let flagData = []
let nameGlyphs = []

const jsdom = require("jsdom")
const { JSDOM } = jsdom
const { document } = new JSDOM("<!doctype html><html><body></body></html>", {
	resources: "usable",
	url: "file:///" + __dirname + "/",
}).window

class ImageHelper {
	constructor() {
		this.imageData = null
		this.cacheNearestBinaryPixel = null
		this.cacheNextFilledColumn = null
		this.cachePrevFilledColumn = null
		this.cacheNextEmptyColumn = null
		this.cacheColumnFilling = null
	}

	static fromSrc(src, onload) {
		let image = new ImageHelper()
		image.imageData = null

		let img = document.createElement("img")
		img.onload = () => {
			let canvas = document.createElement("canvas")
			canvas.width = img.width
			canvas.height = img.height

			let ctx = canvas.getContext("2d")
			ctx.drawImage(img, 0, 0, img.width, img.height)
			image.imageData = ctx.getImageData(0, 0, img.width, img.height)

			if (onload != null) onload(image)
		}

		img.onerror = () => {
			if (onload != null) onload(null)
		}

		img.setAttribute("crossOrigin", "anonymous")
		img.src = src

		return image
	}

	static fromImage(img) {
		let canvas = document.createElement("canvas")
		canvas.width = img.width
		canvas.height = img.height

		let ctx = canvas.getContext("2d")
		ctx.drawImage(img, 0, 0, img.width, img.height)

		let image = new ImageHelper()
		image.imageData = ctx.getImageData(0, 0, img.width, img.height)

		return image
	}

	static fromCanvas(canvas) {
		let ctx = canvas.getContext("2d")
		ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height)

		let image = new ImageHelper()
		image.imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)

		return image
	}

	toJsonBinarized() {
		let str = "ImageHelper.fromJsonBinarized("
		str += this.imageData.width + ", "
		str += this.imageData.height + ", "
		str += "["

		let pixelNum = this.imageData.width * this.imageData.height
		let curState = false
		let curRunLength = 0
		let groups = 0

		for (let i = 0; i < pixelNum; i++) {
			if (this.imageData.data[i * 4 + 0] != (curState ? 255 : 0)) {
				if (groups > 0) str += ","

				str += curRunLength.toString()

				curState = !curState
				curRunLength = 0
				groups += 1
			}

			curRunLength += 1
		}

		return str + "])"
	}

	static fromJsonBinarized(w, h, data) {
		let array = new Uint8ClampedArray(w * h * 4)
		let curState = 0
		let curPixel = 0
		for (let runLength of data) {
			for (let i = 0; i < runLength; i++) {
				let addr = curPixel * 4
				array[addr + 0] = curState
				array[addr + 1] = curState
				array[addr + 2] = curState
				array[addr + 3] = 255

				curPixel += 1
			}

			curState = curState == 0 ? 255 : 0
		}

		while (curPixel < w * h) {
			let addr = curPixel * 4
			array[addr + 0] = curState
			array[addr + 1] = curState
			array[addr + 2] = curState
			array[addr + 3] = 255

			curPixel += 1
		}

		let image = new ImageHelper()
		image.imageData = new ImageData(array, w, h)

		image.createCache()
		return image
	}

	toJson() {
		let str = "ImageHelper.fromJson("
		str += this.imageData.width + ", "
		str += this.imageData.height + ", "
		str += "["

		let pixelNum = this.imageData.width * this.imageData.height
		for (let i = 0; i < pixelNum; i++) {
			if (i > 0) str += ","

			str += this.imageData.data[i * 4 + 0] + ","
			str += this.imageData.data[i * 4 + 1] + ","
			str += this.imageData.data[i * 4 + 2]
		}

		return str + "])"
	}

	static fromJson(w, h, data) {
		let array = new Uint8ClampedArray(w * h * 4)

		for (let i = 0; i < w * h; i++) {
			array[i * 4 + 0] = data[i * 3 + 0]
			array[i * 4 + 1] = data[i * 3 + 1]
			array[i * 4 + 2] = data[i * 3 + 2]
			array[i * 4 + 3] = 255
		}

		let image = new ImageHelper()
		image.imageData = new ImageData(array, w, h)

		image.createCache()
		return image
	}

	clone() {
		let array = new Uint8ClampedArray(this.imageData.width * this.imageData.height * 4)

		for (let i = 0; i < this.imageData.width * this.imageData.height * 4; i++) array[i] = this.imageData.data[i]

		let image = new ImageHelper()
		image.imageData = new ImageData(array, this.imageData.width, this.imageData.height)

		return image
	}

	getBinaryPixel(x, y) {
		return this.imageData.data[(y * this.imageData.width + x) * 4] != 0
	}

	getPixel(x, y, r, g, b) {
		if (x < 0 || y < 0 || x >= this.imageData.width || y >= this.imageData.height) return { r: 0, g: 0, b: 0, a: 0 }

		let index = y * this.imageData.width + x
		return {
			r: this.imageData.data[index * 4 + 0],
			g: this.imageData.data[index * 4 + 1],
			b: this.imageData.data[index * 4 + 2],
			a: this.imageData.data[index * 4 + 3],
		}
	}

	setPixel(x, y, r, g, b, a = 255) {
		if (x < 0 || y < 0 || x >= this.imageData.width || y >= this.imageData.height) return

		let index = y * this.imageData.width + x
		this.imageData.data[index * 4 + 0] = r
		this.imageData.data[index * 4 + 1] = g
		this.imageData.data[index * 4 + 2] = b
		this.imageData.data[index * 4 + 3] = a
	}

	stretchTo(w, h) {
		let canvasBefore = this.makeCanvas()

		let canvasAfter = document.createElement("canvas")
		canvasAfter.width = w
		canvasAfter.height = h

		let ctx = canvasAfter.getContext("2d")
		ctx.drawImage(canvasBefore, 0, 0, w, h)

		return ImageHelper.fromCanvas(canvasAfter)
	}

	makeCanvas() {
		let canvas = document.createElement("canvas")
		canvas.width = this.imageData.width
		canvas.height = this.imageData.height

		let ctx = canvas.getContext("2d")
		ctx.putImageData(this.imageData, 0, 0)

		return canvas
	}

	extractRegion(x, y, w, h) {
		let canvas = document.createElement("canvas")
		canvas.width = w
		canvas.height = h

		let ctx = canvas.getContext("2d")
		ctx.putImageData(this.imageData, -x, -y)

		let image = new ImageHelper()
		image.imageData = ctx.getImageData(0, 0, w, h)

		return image
	}

	letterbox(xTop, yTop, w, h) {
		let canvas = document.createElement("canvas")
		canvas.width = w
		canvas.height = h

		let ctx = canvas.getContext("2d")
		ctx.fillStyle = "black"
		ctx.fillRect(0, 0, w, h)
		ctx.putImageData(this.imageData, xTop, yTop)

		let image = new ImageHelper()
		image.imageData = ctx.getImageData(0, 0, w, h)

		return image
	}

	displace(xTop, yTop) {
		let newImage = this.clone()

		for (let y = 0; y < this.imageData.height; y++) for (let x = 0; x < this.imageData.width; x++) newImage.setPixel(x, y, 0, 0, 0, 255)

		for (let y = 0; y < this.imageData.height; y++) {
			for (let x = 0; x < this.imageData.width; x++) {
				let fromPixel = this.getPixel(x, y)
				newImage.setPixel(xTop + x, yTop + y, fromPixel.r, fromPixel.g, fromPixel.b, 255)
			}
		}

		return newImage
	}

	detectTrophyScreen() {
		let region = this.extractRegion(0, 0, 250, 20)
		let isRed = region.wholeImageProximity(220, 0, 0)

		return isRed > 0.9
	}

	findProbableLetterBase() {
		let heights = []
		for (let y = this.imageData.height - 5; y >= (this.imageData.height / 3) * 2; y--) heights[y] = 0

		for (let x = 0; x < this.imageData.width; x++) {
			let y = this.imageData.height - 1
			while (y >= this.imageData.height / 2) {
				if (this.getBinaryPixel(x, y)) break

				y--
			}

			if (y <= this.imageData.height / 2) continue

			heights[y]++
		}

		let maxCount = 0
		let result = 0
		for (let y = this.imageData.height - 5; y >= (this.imageData.height / 3) * 2; y--) {
			//console.log("height[" + y + "] = " + heights[y])
			if (heights[y] > maxCount) {
				maxCount = heights[y]
				result = y
			}
		}

		//console.log("letterbase: " + result)
		return result

		/*let accum = 0
		let count = 0
		for (let y = this.imageData.height - 5; y >= this.imageData.height / 3 * 2; y--)
		{
			accum += y * heights[y]
			count += heights[y]
		}
		
		return Math.round(accum / count)*/
	}

	extractPlayers(cache = true) {
		let players = []

		if (this.detectTrophyScreen()) {
			for (let i = 0; i < 12; i++) players.push(this.extractRegion(150, 133 + 42 * i, 275, 34))

			for (let i = 0; i < 12; i++) players[i] = players[i].stretchTo(250, 31)

			for (let i = 0; i < 12; i++) {
				let isYellow = players[i].regionProximity(0, 0, players[i].imageData.width, 5, 241, 220, 15)

				if (isYellow > 0.8) players[i].binarize(77, 85, 64, 0.7)
				else players[i].binarize(202, 195, 187, 0.85)
			}

			for (let i = 0; i < 12; i++) players[i] = players[i].letterbox(0, 7, 275, 43)
		} else {
			for (let i = 0; i < 12; i++) players.push(this.extractRegion(680, 52 + 52 * i, 275, 43))

			for (let i = 0; i < 12; i++) {
				let isYellow = players[i].regionProximity(0, 0, players[i].imageData.width, 5, 241, 220, 15)

				if (isYellow > 0.8) players[i].binarize(77, 85, 64, 0.8)
				else players[i].binarize(255, 255, 255, 0.7)

				//let letterBase = players[i].findProbableLetterBase()
				//players[i] = players[i].letterbox(0, letterBase - 31, players[i].imageData.width, players[i].imageData.height)
			}
		}

		if (cache) for (let i = 0; i < 12; i++) players[i].createCache()

		return players
	}

	extractScores(cache = true) {
		let scores = []

		if (this.detectTrophyScreen()) {
			for (let i = 0; i < 12; i++) scores.push(this.extractRegion(501, 133 + 42 * i, 86, 34))

			for (let i = 0; i < 12; i++) scores[i] = scores[i].stretchTo(69, 26)

			for (let i = 0; i < 12; i++) {
				let isYellow = scores[i].regionProximity(0, 0, scores[i].imageData.width, 5, 241, 220, 15)

				if (isYellow > 0.8) scores[i].binarize(77, 85, 64, 0.7)
				else scores[i].binarize(202, 195, 187, 0.85)
			}

			for (let i = 0; i < 12; i++) scores[i] = scores[i].letterbox(24, 13, 92, 43)
		} else {
			for (let i = 0; i < 12; i++) scores.push(this.extractRegion(1126, 52 + 52 * i, 92, 43))

			for (let i = 0; i < 12; i++) {
				let isYellow = scores[i].regionProximity(0, 0, scores[i].imageData.width, 5, 241, 220, 15)

				if (isYellow > 0.8) scores[i].binarize(77, 85, 64, 0.7)
				else scores[i].binarize(255, 255, 255, 0.7)
			}
		}

		if (cache) for (let i = 0; i < 12; i++) scores[i].createCache()

		return scores
	}

	extractFlags() {
		let flags = []

		if (this.detectTrophyScreen()) {
			for (let i = 0; i < 12; i++) flags.push(ImageHelper.fromJsonBinarized(42, 28, []))
		} else {
			for (let i = 0; i < 12; i++) flags.push(this.extractRegion(958, 60 + 52 * i, 42, 28))
		}

		return flags
	}

	static colorProximity(r1, g1, b1, r2, g2, b2) {
		let rFactor = Math.abs(r1 - r2) / 255
		let gFactor = Math.abs(g1 - g2) / 255
		let bFactor = Math.abs(b1 - b2) / 255

		return 1 - Math.max(0, Math.min(1, (rFactor + gFactor + bFactor) / 3))
	}

	regionProximity(x1, y1, x2, y2, r, g, b) {
		let result = 0
		for (let yy = y1; yy < y2; yy++)
			for (let xx = x1; xx < x2; xx++) {
				let i = yy * this.imageData.width + xx

				result += ImageHelper.colorProximity(
					r,
					g,
					b,
					this.imageData.data[i * 4 + 0],
					this.imageData.data[i * 4 + 1],
					this.imageData.data[i * 4 + 2]
				)
			}

		return result / ((x2 - x1) * (y2 - y1))
	}

	wholeImageProximity(r, g, b) {
		let result = 0
		for (let i = 0; i < this.imageData.width * this.imageData.height; i++) {
			result += ImageHelper.colorProximity(
				r,
				g,
				b,
				this.imageData.data[i * 4 + 0],
				this.imageData.data[i * 4 + 1],
				this.imageData.data[i * 4 + 2]
			)
		}

		return result / (this.imageData.width * this.imageData.height)
	}

	binarize(r, g, b, threshold) {
		for (let i = 0; i < this.imageData.width * this.imageData.height; i++) {
			let factor = ImageHelper.colorProximity(
				r,
				g,
				b,
				this.imageData.data[i * 4 + 0],
				this.imageData.data[i * 4 + 1],
				this.imageData.data[i * 4 + 2]
			)

			let binary = factor > threshold ? 255 : 0

			this.imageData.data[i * 4 + 0] = binary
			this.imageData.data[i * 4 + 1] = binary
			this.imageData.data[i * 4 + 2] = binary
			this.imageData.data[i * 4 + 3] = 255
		}
	}

	compareBinary(other) {
		let result = 0
		for (let i = 0; i < this.imageData.width * this.imageData.height; i++)
			result += 1 - Math.abs(other.imageData.data[i * 4 + 0] - this.imageData.data[i * 4 + 0]) / 255

		return result / (this.imageData.width * this.imageData.height)
	}

	findNextBinaryColumn(x, filled) {
		if (x == null || x < 0) x = 0

		while (x < this.imageData.width) {
			let columnFilled = false

			for (let y = 0; y < this.imageData.height; y++) {
				if (this.getBinaryPixel(x, y)) {
					columnFilled = true
					break
				}
			}

			if (filled == columnFilled) return x

			x += 1
		}

		return null
	}

	findPreviousBinaryColumn(x, filled) {
		while (x >= 0) {
			let columnFilled = false

			for (let y = 0; y < this.imageData.height; y++) {
				if (this.getBinaryPixel(x, y)) {
					columnFilled = true
					break
				}
			}

			if (filled == columnFilled) return x

			x -= 1
		}

		return null
	}

	getNearestBinaryPixel(x, y, xMin, yMin, xMax, yMax) {
		let testPixel = (x, y) => {
			if (x < xMin || x >= xMax || y < yMin || y >= yMax) return false

			return this.getBinaryPixel(x, y)
		}

		for (let layer = 0; layer <= 4; layer++) {
			for (let step = 0; step <= layer; step++) {
				if (
					testPixel(x - layer, y - step) ||
					testPixel(x - layer, y + step) ||
					testPixel(x + layer, y - step) ||
					testPixel(x + layer, y + step) ||
					testPixel(x - step, y - layer) ||
					testPixel(x + step, y - layer) ||
					testPixel(x - step, y + layer) ||
					testPixel(x + step, y + layer)
				) {
					return layer + (layer > 0 ? step / layer : 0)
				}
			}
		}

		return 100
	}

	createCache() {
		if (this.cacheNearestBinaryPixel != null) return

		this.cacheNearestBinaryPixel = []
		for (let y = 0; y < this.imageData.height; y++) {
			this.cacheNearestBinaryPixel.push([])
			for (let x = 0; x < this.imageData.width; x++) {
				this.cacheNearestBinaryPixel[y].push(this.getNearestBinaryPixel(x, y, 0, 0, this.imageData.width, this.imageData.height))
			}
		}

		this.cacheNextFilledColumn = []
		this.cacheNextEmptyColumn = []
		this.cachePrevFilledColumn = []
		this.cacheColumnFilling = []
		for (let x = 0; x < this.imageData.width; x++) {
			this.cacheNextFilledColumn.push(this.findNextBinaryColumn(x, true))
			this.cacheNextEmptyColumn.push(this.findNextBinaryColumn(x, false))
			this.cachePrevFilledColumn.push(this.findPreviousBinaryColumn(x, true))
			this.cacheColumnFilling.push(this.getColumnFilling(x))
		}
	}

	getColumnFilling(x) {
		let filling = 0
		for (let y = 0; y < this.imageData.height; y++) {
			if (this.getBinaryPixel(x, y)) filling += 1
		}

		return filling / this.imageData.height
	}

	getRegionFilling(xMin, yMin, w, h, divide = true) {
		let result = 0
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) result += this.getBinaryPixel(x + xMin, y + yMin) ? 1 : 0

		return result / (divide ? w * h : 1)
	}

	scoreGlyph(glyph, xPen, debug = false) {
		let nextColumn = this.cacheNextFilledColumn[xPen + 2]
		let nextEmptyColumn = this.cacheNextEmptyColumn[xPen + glyph.data.imageData.width]
		let endColumn = this.cacheNextFilledColumn[xPen + glyph.data.imageData.width + 4]
		let prevColumn = this.cachePrevFilledColumn[xPen + glyph.data.imageData.width + 1]

		if (nextColumn == null || prevColumn == null) return null

		if (nextColumn - xPen < 2 || (endColumn == null && prevColumn - xPen < 2)) return null

		if (nextEmptyColumn == null || nextEmptyColumn - xPen > 80) return null

		let estimatedWidthDiff = Math.abs(nextEmptyColumn - xPen - glyph.data.imageData.width)
		let estimatedWidthBonus = 1 / (estimatedWidthDiff + 1)

		let wrongColumns = 0
		for (let x = xPen; x < xPen + glyph.data.imageData.width; x++)
			wrongColumns += Math.abs(this.cacheColumnFilling[x] - glyph.data.cacheColumnFilling[x - xPen])

		if (glyph.data.imageData.width < 5) wrongColumns = 0
		else wrongColumns /= glyph.data.imageData.width

		let nonMatchingPixels = 0
		let glyphDistanceSum = 0
		let glyphDistanceMax = 0
		let glyphPixelNum = 0
		let targetDistanceSum = 0
		let targetDistanceNum = 0
		let targetDistanceMax = 0
		let targetPixelNum = 0
		for (let y = 0; y < this.imageData.height; y++) {
			for (let x = 0; x < glyph.data.imageData.width; x++) {
				if (glyph.data.cacheNearestBinaryPixel[y][x] == 0) {
					glyphPixelNum += 1

					let distance = this.cacheNearestBinaryPixel[y][x + xPen]
					glyphDistanceSum += distance
					glyphDistanceMax = Math.max(glyphDistanceMax, distance)
				}

				if (this.cacheNearestBinaryPixel[y][x + xPen] == 0) {
					targetPixelNum += 1

					let distance = glyph.data.cacheNearestBinaryPixel[y][x]
					targetDistanceSum += distance
					targetDistanceNum += 1
					targetDistanceMax = Math.max(targetDistanceMax, distance)
				}

				if ((this.cacheNearestBinaryPixel[y][x + xPen] <= 1) ^ (glyph.data.cacheNearestBinaryPixel[y][x] <= 1)) nonMatchingPixels += 1
			}
		}

		let scoreParts = [
			-Math.pow(glyphDistanceMax <= 1 ? 0 : glyphDistanceMax, 1.5) * 5,
			-glyphDistanceSum / (glyphPixelNum * 0.1),
			-glyphDistanceSum * 0.05,
			-Math.pow(targetDistanceMax <= 1 ? 0 : targetDistanceMax, 1.5) * 10,
			-(targetDistanceSum / targetDistanceNum) * 25,
			-targetDistanceSum * 0.1,
			-nonMatchingPixels * 0.05,
			+(glyph.data.imageData.width < 8 ? -5 + glyph.data.imageData.width * 0.5 : 20 + (glyph.data.imageData.width - 8) * 0.5),
			+estimatedWidthBonus * 19,
			glyph.data.imageData.width < 8 && estimatedWidthBonus < 0.5 ? -10 : 0,
			glyph.data.imageData.width < 8 && estimatedWidthBonus > 0.5 ? 10 : 0,
			glyphPixelNum * 0.075,
		]

		let score = 0
		scoreParts.forEach((s) => (score += s))

		if (debug)
			console.log(
				"x(" +
					xPen.toString().padStart(3) +
					") " +
					'"' +
					glyph.c +
					'" ' +
					"score(" +
					score.toFixed(5).padStart(8) +
					") " +
					"width(" +
					glyph.data.imageData.width.toString().padStart(2) +
					") " +
					"glyphPixels(" +
					glyphPixelNum.toString().padStart(3) +
					") " +
					"targetPixels(" +
					targetPixelNum.toString().padStart(3) +
					") " +
					"glyphDist max(" +
					glyphDistanceMax.toFixed(2).padStart(6) +
					") sum(" +
					glyphDistanceSum.toFixed(2).padStart(6) +
					") " +
					"targetDist max(" +
					targetDistanceMax.toFixed(2).padStart(6) +
					") sum(" +
					targetDistanceSum.toFixed(2).padStart(6) +
					") avg(" +
					(targetDistanceSum / targetDistanceNum).toFixed(2).padStart(6) +
					") " +
					"nonMatch(" +
					nonMatchingPixels.toFixed(2).padStart(6) +
					") " +
					"wrongCols(" +
					wrongColumns.toFixed(2).padStart(6) +
					") " +
					"estWidthDiff(" +
					estimatedWidthDiff +
					") | " +
					"scores(" +
					scoreParts.map((s) => s.toFixed(2).padStart(6)).join(",") +
					")"
			)

		return score
	}

	disambiguateGlyphI(x, w, debug = false) {
		let width = 1
		for (let y = 0; y < this.imageData.height; y++) width = Math.max(width, this.getRegionFilling(x, y, w, 1, false))

		let smallISep =
			this.getRegionFilling(x, 17, w, 1, false) < Math.ceil(width / 2) ||
			this.getRegionFilling(x, 18, w, 1, false) < Math.ceil(width / 2) ||
			this.getRegionFilling(x, 19, w, 1, false) < Math.ceil(width / 2)

		let smallDotlessITittle =
			this.getRegionFilling(x, 12, w, 1, false) == 0 &&
			this.getRegionFilling(x, 13, w, 1, false) == 0 &&
			this.getRegionFilling(x, 14, w, 1, false) == 0 &&
			this.getRegionFilling(x, 15, w, 1, false) == 0

		let exclamationSep =
			this.getRegionFilling(x, 27, w, 1, false) < Math.ceil(width / 2) || this.getRegionFilling(x, 28, w, 1, false) < Math.ceil(width / 2)

		if (debug) {
			console.log(
				"width(" +
					width +
					") " +
					"smallISep(" +
					smallISep +
					") " +
					"smallDotlessITittle(" +
					smallDotlessITittle +
					") " +
					"exclamationSep(" +
					exclamationSep +
					")"
			)
		}

		if (exclamationSep && !smallISep) return "!"

		if (smallISep && smallDotlessITittle) return "ı"

		if (smallISep) return "i"

		return "l"
	}

	recognizeDigit(xPen, debug = false) {
		let scores = []

		for (let x = -1; x <= 3; x++) {
			let u = this.getRegionFilling(x + xPen + 6, 16, 7, 3)
			let ul = this.getRegionFilling(x + xPen + 3, 18, 3, 7)
			let ur = this.getRegionFilling(x + xPen + 14, 18, 3, 7)
			let m = this.getRegionFilling(x + xPen + 6, 25, 7, 3)
			let bl = this.getRegionFilling(x + xPen + 3, 27, 3, 7)
			let br = this.getRegionFilling(x + xPen + 14, 27, 3, 7)
			let b = this.getRegionFilling(x + xPen + 6, 34, 7, 3)
			let one = this.getRegionFilling(x + xPen + 9, 18, 4, 14)

			let max = Math.max(u, ul, ur, m, bl, br, b, one)

			if (debug)
				console.log(
					"max: " +
						max.toFixed(2) +
						", " +
						"segments: [" +
						" u: " +
						u.toFixed(2) +
						", " +
						"ul: " +
						ul.toFixed(2) +
						", " +
						"ur: " +
						ur.toFixed(2) +
						", " +
						" m: " +
						m.toFixed(2) +
						", " +
						"bl: " +
						bl.toFixed(2) +
						", " +
						"br: " +
						br.toFixed(2) +
						", " +
						" b: " +
						b.toFixed(2) +
						", " +
						" 1: " +
						one.toFixed(2) +
						"]"
				)

			let has = (x) => x
			let not = (x) => 1 - x

			scores.push({ x: x, digit: 0, score: has(u) + has(ul) + has(ur) + not(m) + has(bl) + has(br) + has(b) + not(one) })
			scores.push({ x: x, digit: 1, score: not(u) + not(ul) + not(ur) + not(m) + not(bl) + not(br) + not(b) + has(one) - 1 })
			scores.push({ x: x, digit: 2, score: has(u) + not(ul) + has(ur) + has(m) + has(bl) + not(br) + has(b) + not(one) })
			scores.push({ x: x, digit: 3, score: has(u) + not(ul) + has(ur) + has(m) + not(bl) + has(br) + has(b) + not(one) })
			scores.push({ x: x, digit: 4, score: not(u) + has(ul) + has(ur) + has(m) + not(bl) + has(br) + not(b) + not(one) })
			scores.push({ x: x, digit: 5, score: has(u) + has(ul) + not(ur) + has(m) + not(bl) + has(br) + has(b) + not(one) })
			scores.push({ x: x, digit: 6, score: has(u) + has(ul) + not(ur) + has(m) + has(bl) + has(br) + has(b) + not(one) })
			scores.push({ x: x, digit: 7, score: has(u) + not(ul) + has(ur) + not(m) + not(bl) + has(br) + not(b) + not(one) })
			scores.push({ x: x, digit: 8, score: has(u) + has(ul) + has(ur) + has(m) + has(bl) + has(br) + has(b) + not(one) })
			scores.push({ x: x, digit: 9, score: has(u) + has(ul) + has(ur) + has(m) + not(bl) + has(br) + has(b) + not(one) })
		}

		scores.sort((a, b) => b.score - a.score)

		if (debug) {
			for (let entry of scores)
				console.log("x(" + entry.x.toString().padStart(2) + "), digit " + entry.digit + ", score: " + entry.score.toFixed(2).padStart(5))
		}

		return scores[0].digit
	}

	scoreFlag(flag, debug = false) {
		let result = 0
		for (let y = 0; y < this.imageData.height; y++) {
			for (let x = 0; x < this.imageData.width; x++) {
				let index = (y * this.imageData.width + x) * 4

				result += ImageHelper.colorProximity(
					this.imageData.data[index + 0],
					this.imageData.data[index + 1],
					this.imageData.data[index + 2],
					flag.data.imageData.data[index + 0],
					flag.data.imageData.data[index + 1],
					flag.data.imageData.data[index + 2]
				)
			}
		}

		let score = result / (this.imageData.width * this.imageData.height)

		if (debug) console.log('"' + flag.c + '" ' + "score(" + score.toFixed(5).padStart(8) + ")")

		return score
	}

	recognizePlayer(debug = false) {
		this.createCache()

		let str = ""
		let x = 0
		let confidence = 0

		if (nameGlyphs === []) {
			import("./nameGlyphs.js")
				.then((module) => {
					console.log("imported nameGlyphs.js")
					nameGlyphs = module.nameGlyphs
				})
				.catch((err) => {
					console.log("error importing nameGlyphs.js")
					console.log(err)
				})
		}
		while (true) {
			if (debug) console.log("\n\n\n\n")

			let scores = []

			for (let skip = -1; skip <= 1; skip++) {
				let xBegin = this.findNextBinaryColumn(x + skip, true)
				if (xBegin == null) break

				for (let glyph of nameGlyphs) {
					if (glyph.skip) continue

					let score = this.scoreGlyph(glyph, xBegin + skip)
					if (score == null) continue

					scores.push({ x: xBegin + skip, glyph: glyph, score: score })
				}
			}

			if (scores.length == 0) break

			scores.sort((a, b) => b.score - a.score)

			if (debug) {
				console.log(scores)
				for (let g = 0; g < 10; g++) this.scoreGlyph(scores[g].glyph, scores[g].x, true)
			}

			let chosen = scores[0]
			if (debug) console.log("Chosen: " + chosen.glyph.c)

			confidence += chosen.score

			if (chosen.x - x > 6) str += " "

			let c = chosen.glyph.c
			if (c == "l" || c == "i" || c == "I" || c == "!" || c == "ı")
				c = this.disambiguateGlyphI(chosen.x, chosen.glyph.data.imageData.width, debug)

			str += c

			/*for (let x = 0; x < this.imageData.width; x++)
			{
				if (!this.getBinaryPixel(x, 13))
					this.setPixel(x, 13, 255, 0, 0)
				
				if (!this.getBinaryPixel(x, 31))
					this.setPixel(x, 31, 255, 0, 0)
			}*/

			for (let y = 0; y < this.imageData.height; y++)
				for (let xp = 0; xp < chosen.glyph.data.imageData.width; xp++) {
					if (chosen.glyph.data.getBinaryPixel(xp, y)) {
						if (this.getBinaryPixel(chosen.x + xp, y)) this.setPixel(chosen.x + xp, y, 0, 0, 255)
						else this.setPixel(chosen.x + xp, y, 255, 0, 255)
					} else {
						if (this.getBinaryPixel(chosen.x + xp, y)) this.setPixel(chosen.x + xp, y, 255, 0, 0)
					}
				}

			for (let y = 0; y < this.imageData.height; y++) {
				if (!this.getBinaryPixel(chosen.x, y)) this.setPixel(chosen.x, y, 0, 0, 255)
			}

			x = chosen.x + chosen.glyph.data.imageData.width + 1
		}

		let isUppercase = (c) => {
			if (c == null) return false

			c = c.charCodeAt(0)

			return c >= "A".charCodeAt(0) && c <= "Z".charCodeAt(0)
		}

		let replaceChar = (str, index, c) => {
			return str.substr(0, index) + c + str.substr(index + c.length)
		}

		for (let i = 0; i < str.length; i++) {
			let c = str[i]
			if (c != "l" && c != "I") continue

			let prev = i > 0 ? str[i - 1] : null
			let next = i < str.length - 1 ? str[i + 1] : null

			if ((c == "l" && prev == null) || (isUppercase(prev) && isUppercase(next))) str = replaceChar(str, i, "I")
		}

		return { str: str, confidence: confidence }
	}

	recognizeScore(debug) {
		this.createCache()

		let value = 0
		let x = this.imageData.width - 18 * 5

		let emptyRegion = this.getRegionFilling(0, 0, this.imageData.width, 5)
		if (emptyRegion > 0.1) return 0

		while (x < this.imageData.width) {
			if (debug) console.log("\n\n\n\n")

			let regionFilling = this.getRegionFilling(x, 0, 18, this.imageData.height)
			if (regionFilling > 0.01) {
				let digit = this.recognizeDigit(x, debug)

				if (debug) console.log("chosen: " + digit)

				if (digit == null) break

				value = value * 10 + digit

				for (let y = 0; y < this.imageData.height; y++) {
					if (!this.getBinaryPixel(x, y)) this.setPixel(x, y, 0, 0, 255)
				}
			}

			x += 18
		}

		return value
	}

	recognizeFlag() {
		this.createCache()

		//console.log("\n\n\n\n")

		let scores = []
		for (let flag of flagData) {
			let score = this.scoreFlag(flag)
			if (score == null) continue

			scores.push({ flag: flag, score: score })
		}

		scores.sort((a, b) => b.score - a.score)

		if (scores.length == 0 || scores[0].score < 0.75) {
			return ""
		}

		let chosen = scores[0]
		return chosen.flag.c
	}
}

flagData = [
	{
		c: "au",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				139, 132, 115, 163, 153, 145, 191, 181, 180, 173, 161, 165, 130, 116, 122, 97, 81, 88, 81, 64, 69, 82, 64, 66, 152, 131, 131, 166,
				144, 140, 149, 127, 119, 138, 117, 107, 138, 119, 109, 116, 99, 90, 83, 67, 58, 101, 82, 74, 104, 84, 78, 117, 96, 92, 135, 115, 114,
				150, 133, 135, 158, 146, 154, 142, 135, 150, 98, 98, 119, 75, 81, 106, 69, 82, 110, 68, 84, 116, 64, 82, 115, 63, 80, 113, 66, 83,
				114, 63, 79, 107, 71, 85, 109, 74, 85, 106, 71, 81, 98, 67, 80, 91, 67, 84, 90, 70, 92, 96, 69, 93, 101, 66, 90, 105, 68, 87, 111, 71,
				84, 115, 77, 85, 113, 88, 91, 109, 126, 116, 108, 148, 134, 135, 181, 164, 171, 198, 179, 189, 184, 162, 175, 149, 125, 138, 118, 91,
				103, 81, 52, 63, 155, 123, 131, 174, 140, 146, 156, 120, 124, 147, 112, 114, 153, 122, 123, 126, 101, 102, 74, 51, 52, 97, 72, 74,
				113, 88, 91, 144, 119, 125, 175, 151, 161, 189, 169, 183, 191, 178, 198, 156, 148, 175, 92, 92, 126, 68, 75, 115, 60, 74, 118, 52, 71,
				118, 44, 65, 115, 49, 69, 119, 58, 79, 127, 51, 70, 117, 53, 71, 113, 63, 78, 116, 69, 82, 116, 63, 80, 107, 56, 78, 99, 54, 80, 98,
				56, 84, 105, 55, 82, 109, 54, 78, 112, 57, 75, 113, 63, 77, 111, 76, 83, 108, 104, 91, 87, 110, 93, 96, 135, 113, 122, 172, 146, 158,
				195, 166, 180, 195, 162, 177, 184, 147, 162, 144, 105, 118, 190, 147, 158, 193, 147, 157, 162, 113, 122, 151, 102, 109, 169, 126, 131,
				152, 119, 122, 92, 64, 65, 123, 93, 95, 151, 121, 124, 187, 158, 164, 206, 179, 190, 195, 173, 189, 175, 160, 183, 121, 114, 144, 76,
				77, 116, 61, 70, 115, 56, 72, 123, 50, 71, 126, 43, 68, 125, 47, 73, 131, 52, 79, 136, 46, 72, 127, 55, 79, 132, 82, 102, 153, 99,
				117, 166, 90, 110, 153, 66, 92, 129, 46, 75, 109, 46, 77, 112, 49, 80, 120, 51, 79, 124, 53, 76, 123, 58, 76, 118, 70, 81, 111, 103,
				87, 81, 102, 81, 81, 119, 94, 98, 143, 113, 120, 173, 139, 148, 206, 167, 177, 228, 183, 193, 220, 171, 182, 237, 183, 193, 219, 161,
				171, 175, 113, 122, 161, 100, 107, 189, 136, 139, 191, 150, 149, 137, 103, 100, 174, 138, 135, 203, 167, 166, 225, 191, 193, 218, 188,
				195, 180, 155, 168, 139, 121, 143, 82, 74, 103, 65, 66, 104, 53, 64, 109, 49, 68, 119, 47, 72, 128, 44, 74, 133, 44, 75, 135, 37, 69,
				129, 41, 74, 131, 78, 107, 165, 128, 152, 205, 153, 175, 223, 135, 159, 208, 89, 118, 168, 43, 76, 123, 37, 71, 119, 43, 77, 128, 47,
				78, 133, 49, 75, 131, 54, 75, 124, 67, 83, 117, 132, 114, 102, 141, 118, 110, 162, 136, 130, 174, 143, 140, 188, 150, 149, 211, 167,
				168, 232, 182, 183, 251, 198, 200, 254, 194, 196, 231, 165, 169, 192, 120, 125, 182, 111, 114, 214, 152, 150, 234, 185, 179, 197, 156,
				148, 229, 187, 180, 246, 205, 199, 248, 209, 207, 225, 191, 194, 182, 153, 163, 142, 122, 139, 102, 92, 118, 75, 76, 112, 54, 65, 109,
				43, 63, 114, 40, 68, 123, 39, 71, 129, 34, 68, 129, 19, 55, 115, 38, 75, 133, 104, 138, 199, 173, 202, 242, 202, 228, 255, 175, 202,
				244, 111, 143, 201, 47, 82, 137, 34, 71, 127, 38, 75, 133, 40, 74, 136, 42, 71, 132, 49, 72, 127, 65, 83, 123, 151, 133, 108, 165,
				144, 122, 189, 162, 143, 211, 179, 161, 223, 184, 169, 226, 180, 167, 233, 181, 170, 248, 199, 189, 249, 187, 178, 225, 153, 146, 193,
				115, 109, 177, 99, 93, 196, 127, 118, 239, 184, 171, 223, 174, 161, 240, 194, 181, 242, 197, 186, 234, 192, 185, 220, 182, 180, 200,
				168, 173, 176, 153, 167, 159, 146, 170, 96, 96, 129, 68, 78, 120, 53, 73, 121, 42, 70, 124, 37, 70, 128, 36, 72, 132, 25, 63, 123, 41,
				80, 138, 102, 139, 200, 172, 202, 242, 202, 228, 254, 173, 200, 243, 111, 142, 206, 53, 88, 147, 43, 82, 141, 44, 82, 143, 42, 77,
				142, 43, 73, 138, 53, 77, 134, 62, 80, 123, 119, 103, 70, 114, 93, 64, 121, 96, 69, 123, 92, 67, 124, 87, 64, 131, 86, 66, 139, 85,
				68, 151, 92, 74, 150, 81, 67, 148, 73, 60, 159, 79, 68, 172, 92, 81, 165, 93, 81, 132, 73, 62, 130, 78, 67, 139, 89, 79, 135, 86, 78,
				130, 83, 80, 131, 90, 91, 130, 96, 103, 112, 86, 102, 99, 84, 110, 70, 68, 103, 62, 71, 115, 55, 74, 126, 44, 70, 128, 36, 69, 130,
				45, 80, 144, 40, 79, 141, 28, 67, 128, 49, 85, 148, 102, 133, 199, 135, 162, 230, 115, 143, 209, 68, 101, 162, 33, 69, 127, 38, 77,
				136, 40, 79, 140, 37, 73, 138, 42, 71, 137, 53, 77, 137, 58, 75, 121, 138, 124, 89, 143, 124, 92, 147, 124, 95, 141, 113, 87, 145,
				111, 88, 162, 120, 100, 166, 116, 98, 172, 114, 97, 184, 117, 103, 170, 97, 84, 168, 90, 78, 165, 87, 76, 154, 83, 75, 155, 95, 92,
				147, 92, 92, 148, 94, 96, 145, 94, 96, 149, 100, 106, 150, 105, 116, 141, 104, 121, 130, 102, 128, 100, 83, 118, 72, 66, 111, 68, 74,
				127, 58, 74, 135, 45, 68, 135, 38, 69, 137, 39, 73, 143, 49, 87, 156, 39, 75, 144, 41, 75, 143, 60, 90, 159, 73, 100, 169, 63, 90,
				154, 41, 73, 129, 47, 83, 137, 47, 86, 141, 49, 86, 144, 47, 81, 144, 47, 76, 140, 53, 76, 134, 60, 77, 121, 148, 137, 106, 161, 145,
				118, 153, 134, 111, 163, 139, 120, 188, 158, 141, 207, 170, 157, 209, 164, 154, 206, 153, 144, 220, 159, 151, 195, 129, 122, 176, 105,
				99, 166, 93, 89, 172, 105, 104, 217, 161, 164, 217, 169, 176, 218, 171, 179, 205, 157, 166, 203, 156, 168, 200, 157, 175, 182, 146,
				169, 156, 129, 160, 117, 99, 140, 78, 72, 122, 67, 73, 131, 54, 69, 134, 44, 67, 136, 43, 71, 142, 39, 71, 143, 47, 82, 153, 38, 71,
				141, 40, 72, 140, 44, 73, 140, 45, 71, 136, 42, 69, 128, 43, 75, 128, 79, 115, 164, 91, 129, 180, 89, 126, 180, 70, 103, 162, 53, 80,
				142, 52, 73, 129, 58, 73, 117, 120, 112, 91, 125, 114, 99, 137, 123, 113, 167, 148, 143, 199, 175, 174, 217, 186, 188, 217, 179, 184,
				206, 161, 168, 229, 177, 184, 204, 147, 154, 174, 112, 119, 162, 99, 106, 187, 130, 137, 251, 206, 214, 253, 212, 221, 253, 213, 222,
				226, 184, 195, 215, 174, 188, 209, 172, 190, 183, 152, 175, 138, 116, 146, 98, 85, 123, 76, 74, 121, 61, 69, 123, 47, 64, 123, 46, 70,
				134, 56, 84, 150, 50, 81, 146, 46, 78, 143, 33, 65, 129, 40, 71, 133, 43, 70, 132, 39, 65, 124, 39, 67, 121, 58, 91, 139, 111, 148,
				193, 141, 178, 224, 137, 175, 225, 96, 129, 186, 60, 87, 146, 53, 74, 128, 53, 67, 110, 93, 88, 81, 93, 86, 88, 140, 131, 139, 171,
				159, 172, 186, 169, 187, 196, 173, 194, 190, 161, 185, 175, 140, 164, 214, 173, 197, 198, 152, 175, 160, 111, 133, 147, 97, 118, 180,
				136, 153, 234, 203, 214, 223, 191, 200, 240, 207, 216, 223, 190, 200, 211, 180, 192, 197, 169, 185, 161, 138, 159, 109, 94, 121, 79,
				72, 105, 73, 76, 117, 57, 68, 115, 49, 69, 121, 67, 93, 148, 94, 124, 180, 86, 119, 174, 64, 97, 151, 39, 71, 124, 41, 72, 124, 42,
				70, 125, 37, 64, 120, 40, 70, 121, 72, 107, 152, 131, 169, 211, 172, 211, 247, 171, 209, 252, 114, 148, 202, 63, 91, 149, 53, 74, 127,
				49, 63, 105, 115, 113, 118, 128, 126, 140, 175, 173, 195, 182, 177, 206, 169, 161, 194, 164, 152, 188, 149, 132, 170, 133, 111, 149,
				188, 162, 198, 184, 152, 188, 144, 109, 144, 127, 92, 124, 155, 126, 150, 185, 163, 179, 146, 128, 139, 197, 178, 189, 223, 203, 214,
				227, 208, 220, 209, 193, 208, 171, 159, 178, 125, 118, 143, 103, 104, 134, 76, 85, 122, 58, 76, 116, 67, 91, 136, 111, 141, 185, 158,
				192, 232, 149, 184, 225, 107, 141, 185, 58, 92, 134, 42, 74, 119, 36, 65, 116, 30, 59, 114, 37, 69, 122, 72, 110, 155, 121, 163, 204,
				160, 202, 234, 165, 205, 243, 109, 145, 196, 56, 86, 144, 47, 70, 123, 47, 62, 103, 156, 158, 171, 187, 191, 214, 180, 184, 217, 156,
				159, 201, 135, 137, 183, 118, 119, 168, 100, 96, 148, 93, 86, 137, 160, 149, 196, 168, 153, 198, 135, 117, 160, 114, 97, 136, 129,
				118, 149, 139, 135, 157, 51, 50, 65, 99, 97, 111, 158, 154, 169, 199, 195, 210, 216, 213, 229, 206, 207, 225, 172, 175, 199, 128, 139,
				167, 79, 97, 130, 62, 87, 125, 86, 117, 158, 149, 185, 212, 209, 247, 254, 198, 236, 250, 145, 181, 216, 76, 111, 144, 41, 74, 111,
				28, 59, 107, 21, 54, 110, 22, 58, 115, 42, 82, 131, 61, 105, 150, 81, 125, 172, 97, 141, 191, 69, 108, 164, 40, 74, 132, 43, 70, 121,
				46, 65, 104, 123, 128, 143, 132, 140, 168, 112, 123, 161, 96, 107, 154, 82, 93, 146, 67, 77, 133, 57, 65, 123, 62, 68, 122, 121, 123,
				176, 131, 132, 181, 112, 109, 156, 94, 91, 134, 103, 105, 143, 128, 137, 170, 20, 33, 61, 31, 42, 69, 72, 81, 107, 121, 128, 155, 165,
				172, 200, 189, 198, 229, 170, 185, 217, 108, 127, 163, 70, 95, 136, 54, 85, 128, 71, 106, 151, 120, 159, 202, 166, 207, 247, 155, 193,
				234, 117, 155, 194, 67, 102, 139, 36, 69, 110, 32, 65, 119, 36, 72, 135, 37, 76, 138, 46, 89, 143, 42, 89, 140, 29, 76, 128, 39, 85,
				140, 33, 75, 134, 29, 64, 123, 39, 68, 119, 45, 67, 105, 90, 101, 113, 73, 86, 112, 76, 92, 130, 76, 94, 141, 68, 87, 140, 59, 78,
				135, 55, 74, 131, 57, 73, 129, 84, 97, 150, 84, 96, 143, 80, 91, 134, 71, 83, 124, 63, 79, 123, 70, 91, 141, 23, 46, 97, 38, 59, 108,
				53, 72, 119, 69, 86, 133, 86, 101, 150, 98, 115, 166, 99, 119, 172, 60, 85, 140, 51, 80, 139, 36, 71, 131, 40, 78, 140, 67, 107, 168,
				91, 132, 191, 76, 115, 171, 68, 105, 156, 50, 84, 133, 33, 67, 120, 33, 68, 132, 47, 83, 155, 67, 108, 178, 96, 141, 203, 105, 154,
				212, 62, 112, 169, 41, 91, 150, 29, 73, 136, 24, 62, 124, 30, 62, 115, 42, 68, 106, 86, 102, 114, 61, 80, 109, 53, 76, 119, 53, 78,
				130, 52, 78, 137, 51, 77, 140, 55, 80, 142, 55, 78, 136, 55, 76, 129, 49, 68, 115, 65, 83, 124, 73, 91, 131, 56, 77, 124, 47, 73, 130,
				34, 61, 124, 38, 62, 124, 36, 59, 120, 41, 63, 125, 45, 67, 130, 44, 67, 133, 50, 75, 143, 33, 62, 132, 32, 65, 139, 23, 60, 135, 26,
				64, 140, 43, 82, 157, 53, 93, 165, 35, 73, 141, 43, 80, 145, 45, 78, 141, 37, 70, 134, 34, 69, 139, 44, 83, 158, 71, 113, 186, 109,
				155, 221, 130, 179, 242, 70, 119, 183, 33, 82, 147, 24, 69, 136, 29, 68, 133, 33, 67, 122, 39, 67, 105, 79, 100, 119, 53, 79, 117, 41,
				70, 123, 40, 70, 135, 40, 71, 142, 40, 70, 144, 49, 77, 149, 46, 73, 138, 37, 59, 116, 37, 57, 106, 73, 91, 133, 96, 113, 152, 75, 93,
				138, 47, 69, 124, 43, 66, 127, 36, 59, 121, 37, 60, 124, 41, 64, 130, 36, 61, 130, 30, 57, 130, 38, 68, 145, 30, 63, 143, 27, 63, 146,
				23, 60, 145, 23, 60, 145, 31, 69, 152, 38, 76, 157, 32, 68, 147, 37, 73, 148, 41, 74, 148, 36, 69, 141, 34, 69, 141, 42, 81, 153, 62,
				103, 175, 89, 133, 202, 102, 147, 217, 59, 105, 176, 32, 77, 149, 26, 69, 139, 29, 68, 133, 31, 65, 120, 39, 68, 105, 69, 94, 120, 42,
				72, 118, 36, 69, 132, 37, 72, 146, 34, 68, 149, 31, 64, 146, 43, 73, 151, 52, 79, 149, 60, 82, 140, 69, 87, 135, 108, 124, 163, 138,
				152, 186, 118, 132, 170, 70, 86, 133, 74, 93, 146, 53, 73, 129, 46, 68, 127, 43, 67, 131, 34, 62, 131, 26, 57, 132, 32, 66, 145, 29,
				66, 149, 27, 65, 152, 28, 66, 154, 26, 64, 152, 26, 65, 151, 31, 69, 154, 35, 72, 155, 33, 69, 150, 35, 68, 149, 32, 66, 142, 33, 69,
				140, 40, 79, 147, 51, 91, 159, 62, 104, 175, 61, 102, 177, 43, 86, 163, 33, 75, 152, 30, 69, 143, 27, 64, 130, 27, 61, 115, 40, 69,
				107, 67, 94, 122, 40, 72, 119, 34, 70, 132, 34, 72, 144, 32, 70, 147, 31, 68, 144, 43, 75, 146, 78, 107, 169, 127, 151, 200, 142, 162,
				199, 165, 182, 209, 188, 204, 225, 178, 194, 219, 125, 142, 178, 132, 152, 198, 84, 107, 155, 47, 72, 125, 34, 64, 123, 30, 63, 127,
				21, 57, 128, 18, 57, 134, 19, 61, 142, 20, 63, 147, 28, 71, 156, 31, 74, 159, 28, 71, 155, 25, 66, 149, 27, 66, 147, 29, 67, 146, 31,
				68, 147, 31, 68, 143, 32, 70, 139, 37, 76, 141, 43, 82, 149, 48, 88, 161, 44, 83, 160, 31, 71, 151, 26, 66, 145, 28, 66, 141, 30, 67,
				132, 32, 66, 119, 41, 70, 107, 66, 94, 117, 40, 72, 113, 33, 71, 123, 30, 69, 129, 33, 72, 137, 43, 82, 144, 46, 83, 136, 83, 116,
				159, 166, 194, 223, 203, 228, 245, 219, 241, 248, 227, 248, 250, 226, 248, 255, 204, 228, 251, 150, 176, 215, 89, 118, 161, 59, 92,
				138, 47, 83, 134, 41, 80, 137, 38, 80, 144, 40, 85, 154, 27, 74, 148, 17, 65, 141, 24, 73, 149, 29, 78, 155, 26, 75, 151, 22, 69, 145,
				25, 71, 145, 32, 76, 147, 31, 74, 143, 32, 74, 142, 33, 73, 140, 35, 75, 140, 40, 79, 147, 40, 80, 153, 36, 75, 154, 30, 68, 149, 29,
				67, 147, 30, 68, 142, 32, 68, 133, 35, 69, 120, 42, 71, 107, 66, 94, 115, 40, 72, 108, 34, 70, 118, 33, 72, 127, 36, 77, 133, 37, 77,
				130, 27, 65, 109, 52, 87, 120, 135, 167, 186, 193, 222, 230, 221, 248, 245, 231, 254, 250, 233, 254, 255, 218, 243, 248, 127, 158,
				195, 64, 98, 139, 43, 80, 125, 31, 72, 121, 24, 68, 123, 26, 72, 133, 28, 78, 144, 9, 62, 130, 15, 66, 139, 18, 72, 144, 20, 73, 147,
				18, 72, 145, 19, 72, 143, 30, 80, 149, 31, 81, 148, 23, 72, 138, 31, 77, 142, 35, 77, 142, 37, 77, 142, 42, 80, 149, 41, 79, 152, 37,
				76, 153, 38, 76, 156, 38, 75, 154, 35, 71, 145, 34, 68, 132, 35, 67, 117, 43, 71, 106, 66, 93, 112, 40, 72, 104, 34, 69, 114, 32, 70,
				121, 29, 69, 122, 34, 74, 124, 57, 95, 137, 111, 147, 179, 174, 208, 228, 215, 242, 248, 228, 253, 251, 226, 252, 251, 221, 250, 254,
				207, 240, 252, 155, 191, 231, 92, 131, 174, 50, 91, 138, 33, 77, 128, 30, 77, 134, 28, 77, 139, 19, 72, 138, 16, 72, 141, 19, 74, 147,
				15, 72, 145, 14, 71, 145, 14, 71, 145, 16, 72, 144, 25, 78, 147, 19, 73, 140, 14, 66, 133, 45, 94, 160, 65, 110, 174, 69, 109, 175,
				64, 103, 171, 48, 86, 158, 35, 73, 149, 38, 76, 154, 38, 75, 151, 35, 70, 141, 34, 66, 129, 37, 67, 117, 45, 71, 104, 68, 92, 110, 40,
				70, 103, 35, 68, 111, 36, 72, 123, 32, 69, 124, 28, 66, 119, 48, 84, 132, 88, 122, 161, 129, 161, 191, 183, 210, 230, 214, 240, 250,
				222, 249, 254, 211, 240, 252, 175, 209, 239, 123, 160, 205, 78, 119, 167, 48, 91, 141, 33, 78, 133, 29, 76, 136, 25, 75, 141, 16, 70,
				139, 16, 71, 143, 17, 72, 147, 12, 69, 144, 15, 72, 148, 17, 74, 149, 16, 72, 146, 20, 75, 146, 13, 67, 136, 20, 73, 141, 78, 128,
				195, 123, 167, 225, 133, 172, 228, 111, 149, 214, 70, 107, 177, 39, 76, 148, 39, 74, 149, 38, 72, 145, 35, 68, 135, 36, 67, 125, 43,
				70, 116, 49, 73, 103, 69, 91, 109, 42, 69, 102, 36, 66, 111, 38, 70, 125, 37, 71, 130, 34, 68, 129, 39, 72, 131, 48, 79, 133, 73, 101,
				149, 141, 167, 209, 183, 207, 241, 189, 214, 242, 174, 201, 233, 139, 172, 217, 63, 99, 149, 45, 84, 137, 45, 85, 142, 37, 79, 140,
				28, 73, 138, 27, 74, 144, 24, 74, 147, 18, 70, 146, 15, 68, 146, 12, 66, 145, 19, 73, 152, 22, 75, 154, 18, 71, 147, 22, 73, 148, 17,
				68, 141, 27, 78, 149, 97, 146, 214, 161, 203, 250, 178, 215, 254, 146, 180, 237, 88, 122, 188, 45, 78, 146, 43, 75, 145, 41, 73, 141,
				37, 68, 130, 39, 68, 120, 49, 74, 114, 55, 76, 102, 70, 90, 107, 44, 67, 99, 38, 64, 110, 38, 67, 123, 41, 71, 133, 42, 72, 139, 38,
				67, 135, 30, 58, 125, 47, 72, 135, 108, 131, 190, 134, 156, 211, 126, 148, 200, 116, 140, 192, 107, 137, 189, 34, 67, 120, 32, 66,
				123, 43, 79, 138, 39, 76, 139, 31, 71, 138, 31, 73, 144, 28, 72, 147, 25, 70, 147, 19, 66, 144, 18, 66, 145, 25, 73, 152, 26, 73, 151,
				20, 67, 143, 27, 73, 148, 25, 70, 144, 25, 70, 142, 87, 130, 198, 154, 193, 239, 178, 211, 246, 146, 176, 226, 87, 117, 177, 45, 74,
				136, 47, 76, 140, 48, 76, 138, 43, 70, 126, 44, 68, 115, 53, 75, 110, 61, 80, 101, 73, 90, 102, 48, 67, 95, 41, 63, 104, 42, 66, 118,
				43, 69, 128, 40, 66, 131, 35, 61, 127, 36, 59, 126, 47, 70, 135, 79, 99, 161, 79, 98, 157, 63, 82, 139, 63, 84, 138, 78, 102, 153, 50,
				78, 127, 48, 77, 128, 44, 74, 128, 39, 70, 128, 36, 69, 131, 33, 68, 133, 25, 61, 129, 31, 69, 137, 29, 68, 138, 28, 69, 139, 32, 72,
				143, 30, 70, 139, 25, 64, 132, 34, 72, 140, 32, 70, 137, 22, 60, 125, 60, 96, 157, 109, 142, 195, 130, 159, 206, 110, 137, 183, 70,
				96, 147, 44, 69, 123, 50, 75, 129, 52, 76, 129, 48, 71, 119, 49, 69, 109, 58, 76, 105, 66, 82, 97, 77, 90, 94, 57, 72, 91, 47, 65, 95,
				47, 67, 107, 44, 66, 114, 37, 59, 112, 38, 60, 115, 50, 70, 127, 57, 76, 132, 52, 70, 125, 44, 61, 113, 38, 54, 103, 41, 57, 103, 57,
				75, 115, 55, 76, 114, 56, 77, 116, 55, 77, 118, 52, 75, 120, 48, 73, 120, 43, 70, 119, 38, 67, 120, 35, 66, 119, 38, 68, 123, 38, 68,
				124, 38, 69, 124, 39, 70, 124, 40, 71, 124, 42, 72, 125, 45, 75, 127, 47, 77, 127, 50, 78, 124, 52, 79, 119, 57, 82, 116, 62, 85, 119,
				64, 86, 126, 60, 82, 123, 54, 74, 118, 51, 70, 113, 53, 71, 110, 60, 77, 107, 67, 82, 102, 73, 86, 93, 89, 98, 93, 75, 87, 94, 69, 84,
				99, 68, 85, 107, 65, 83, 111, 59, 78, 110, 61, 80, 114, 71, 90, 125, 77, 94, 129, 73, 90, 122, 67, 83, 114, 63, 77, 107, 63, 77, 103,
				65, 80, 100, 67, 81, 99, 66, 82, 102, 67, 82, 105, 67, 83, 109, 66, 83, 111, 65, 83, 113, 62, 82, 115, 61, 83, 115, 54, 74, 109, 51,
				73, 107, 51, 73, 107, 51, 73, 107, 51, 74, 107, 52, 74, 106, 53, 75, 106, 54, 75, 104, 55, 76, 102, 68, 87, 110, 80, 99, 119, 83, 102,
				122, 85, 101, 128, 82, 97, 127, 76, 92, 123, 73, 89, 119, 75, 90, 117, 80, 94, 114, 85, 97, 107, 87, 97, 97,
			]
		),
	},
	{
		c: "at",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				120, 73, 85, 143, 73, 77, 139, 72, 63, 142, 76, 65, 142, 73, 70, 142, 70, 73, 148, 71, 80, 149, 73, 81, 145, 75, 78, 143, 77, 74, 147,
				76, 71, 153, 73, 71, 156, 70, 74, 157, 69, 79, 155, 70, 78, 153, 73, 76, 152, 75, 73, 152, 74, 75, 151, 75, 73, 152, 74, 75, 152, 75,
				73, 152, 74, 74, 152, 75, 73, 152, 74, 74, 152, 74, 74, 152, 74, 74, 152, 74, 74, 152, 74, 74, 152, 74, 74, 152, 75, 73, 152, 74, 74,
				149, 76, 72, 145, 77, 69, 143, 78, 70, 144, 76, 78, 145, 75, 79, 145, 75, 79, 145, 76, 78, 143, 77, 74, 140, 78, 73, 135, 79, 80, 111,
				72, 80, 142, 66, 78, 171, 68, 72, 169, 68, 58, 173, 71, 59, 175, 67, 64, 175, 64, 68, 179, 60, 72, 179, 60, 72, 174, 63, 67, 171, 66,
				63, 175, 64, 60, 182, 61, 60, 184, 59, 64, 184, 58, 69, 182, 60, 69, 180, 61, 64, 179, 62, 61, 180, 61, 63, 178, 62, 61, 180, 61, 63,
				179, 62, 62, 180, 62, 63, 179, 62, 62, 180, 62, 63, 179, 62, 62, 179, 62, 62, 179, 62, 62, 179, 62, 62, 180, 62, 63, 179, 62, 62, 180,
				62, 63, 178, 63, 61, 177, 64, 57, 177, 63, 59, 178, 62, 68, 177, 61, 71, 175, 62, 70, 174, 64, 68, 170, 66, 64, 164, 69, 64, 159, 73,
				73, 131, 69, 76, 149, 61, 71, 183, 63, 65, 181, 62, 48, 186, 64, 47, 187, 59, 53, 189, 55, 58, 194, 53, 63, 195, 54, 64, 189, 58, 59,
				185, 61, 53, 189, 60, 50, 195, 56, 50, 197, 54, 55, 196, 54, 60, 195, 55, 60, 193, 56, 55, 193, 57, 54, 193, 57, 54, 193, 57, 54, 193,
				57, 54, 193, 57, 54, 193, 57, 54, 193, 57, 54, 193, 57, 54, 193, 57, 54, 193, 57, 54, 193, 57, 54, 193, 57, 54, 193, 57, 54, 193, 57,
				54, 193, 57, 54, 193, 57, 52, 194, 57, 49, 195, 56, 52, 195, 54, 61, 195, 53, 64, 194, 54, 63, 190, 56, 60, 185, 60, 56, 178, 64, 56,
				171, 67, 66, 141, 64, 70, 145, 63, 68, 183, 64, 59, 182, 63, 41, 185, 62, 40, 186, 58, 45, 190, 56, 52, 197, 54, 59, 198, 54, 60, 190,
				59, 55, 185, 63, 47, 188, 62, 43, 194, 59, 44, 196, 57, 49, 194, 57, 55, 193, 58, 55, 193, 59, 53, 193, 60, 50, 193, 60, 50, 193, 60,
				50, 193, 60, 50, 193, 60, 50, 193, 60, 50, 193, 60, 50, 193, 59, 49, 193, 59, 49, 193, 59, 49, 193, 59, 49, 193, 59, 49, 193, 59, 49,
				193, 59, 49, 193, 59, 49, 194, 58, 48, 198, 57, 46, 199, 56, 49, 200, 54, 57, 200, 53, 61, 199, 54, 60, 196, 56, 56, 190, 60, 51, 183,
				63, 51, 175, 67, 60, 142, 63, 65, 143, 63, 65, 184, 64, 55, 183, 63, 37, 187, 63, 35, 189, 59, 42, 195, 57, 51, 199, 52, 55, 198, 51,
				55, 189, 57, 49, 183, 62, 42, 186, 62, 38, 191, 59, 38, 192, 57, 43, 189, 57, 50, 189, 57, 51, 190, 57, 48, 190, 58, 45, 191, 57, 46,
				190, 58, 45, 191, 57, 46, 190, 58, 46, 191, 58, 46, 190, 58, 46, 190, 57, 46, 190, 58, 45, 190, 57, 46, 190, 57, 46, 190, 58, 45, 190,
				57, 46, 190, 58, 45, 191, 57, 46, 191, 57, 45, 195, 56, 43, 196, 54, 46, 197, 52, 55, 198, 51, 58, 198, 52, 56, 196, 54, 51, 191, 57,
				46, 185, 60, 45, 181, 66, 57, 148, 63, 62, 147, 61, 65, 190, 62, 55, 189, 61, 36, 192, 61, 32, 196, 57, 41, 202, 56, 51, 206, 51, 56,
				205, 51, 55, 195, 57, 49, 188, 63, 42, 190, 63, 38, 194, 60, 38, 194, 59, 43, 191, 59, 51, 192, 58, 53, 194, 58, 49, 194, 58, 47, 196,
				57, 49, 194, 58, 47, 196, 57, 49, 195, 58, 48, 196, 58, 49, 195, 58, 48, 196, 58, 49, 196, 59, 49, 196, 58, 49, 196, 58, 49, 196, 59,
				49, 196, 58, 49, 195, 59, 48, 196, 58, 49, 195, 59, 47, 194, 59, 45, 194, 58, 48, 197, 55, 58, 199, 53, 60, 201, 53, 57, 200, 55, 53,
				197, 57, 46, 192, 60, 45, 188, 64, 55, 156, 61, 60, 147, 63, 69, 191, 64, 63, 190, 63, 44, 192, 62, 39, 194, 58, 44, 200, 57, 53, 204,
				53, 58, 203, 53, 57, 194, 59, 51, 187, 64, 45, 188, 64, 42, 192, 62, 42, 191, 61, 48, 187, 62, 54, 187, 62, 57, 191, 61, 54, 192, 61,
				53, 193, 60, 54, 192, 61, 53, 193, 60, 54, 192, 61, 53, 193, 60, 54, 192, 61, 53, 193, 61, 54, 194, 62, 54, 194, 62, 54, 194, 62, 54,
				194, 62, 54, 194, 62, 54, 193, 62, 54, 194, 62, 55, 191, 62, 53, 188, 62, 50, 187, 62, 52, 189, 60, 60, 191, 58, 63, 194, 57, 60, 195,
				58, 55, 194, 59, 49, 191, 61, 49, 187, 65, 58, 155, 60, 59, 138, 68, 75, 173, 67, 73, 169, 61, 54, 174, 65, 52, 176, 64, 53, 177, 61,
				54, 182, 59, 57, 183, 58, 56, 178, 62, 52, 173, 64, 49, 174, 64, 49, 177, 63, 50, 175, 63, 55, 170, 65, 59, 169, 65, 60, 173, 64, 57,
				175, 64, 57, 175, 64, 58, 175, 64, 57, 175, 64, 57, 175, 64, 57, 175, 64, 57, 175, 64, 57, 175, 64, 58, 175, 64, 57, 175, 64, 58, 175,
				64, 58, 175, 64, 57, 175, 64, 58, 175, 64, 57, 175, 64, 58, 174, 64, 57, 173, 64, 54, 170, 65, 56, 168, 64, 60, 168, 63, 62, 172, 62,
				62, 175, 62, 59, 177, 62, 57, 174, 63, 57, 166, 66, 61, 144, 68, 64, 156, 105, 114, 186, 108, 119, 178, 98, 102, 186, 106, 102, 184,
				105, 98, 183, 104, 94, 187, 101, 93, 189, 100, 92, 188, 101, 91, 187, 101, 91, 189, 100, 92, 190, 99, 95, 187, 101, 98, 181, 103, 100,
				180, 103, 100, 183, 102, 97, 184, 102, 96, 184, 102, 97, 184, 102, 96, 184, 102, 97, 184, 102, 97, 184, 102, 97, 184, 102, 97, 184,
				102, 97, 184, 102, 97, 184, 102, 97, 184, 102, 97, 184, 102, 97, 184, 102, 97, 184, 102, 97, 184, 102, 97, 184, 102, 95, 186, 103, 95,
				183, 103, 95, 177, 104, 96, 176, 104, 98, 181, 104, 101, 185, 103, 101, 188, 101, 101, 186, 101, 101, 179, 105, 104, 160, 107, 102,
				203, 170, 183, 232, 183, 198, 227, 177, 187, 231, 185, 189, 227, 180, 177, 228, 184, 176, 229, 183, 175, 230, 182, 173, 230, 181, 173,
				230, 181, 175, 231, 179, 176, 232, 178, 178, 230, 179, 180, 227, 181, 182, 226, 182, 181, 227, 182, 179, 227, 182, 178, 228, 181, 178,
				227, 182, 178, 228, 181, 178, 227, 182, 178, 228, 181, 178, 227, 182, 178, 227, 182, 178, 227, 182, 178, 227, 182, 178, 227, 182, 178,
				227, 182, 178, 227, 182, 178, 227, 182, 178, 228, 181, 178, 228, 182, 177, 230, 183, 178, 228, 183, 177, 224, 185, 176, 224, 186, 179,
				226, 185, 181, 229, 184, 181, 232, 180, 182, 231, 178, 183, 230, 184, 185, 200, 166, 163, 231, 212, 227, 255, 233, 249, 255, 234, 244,
				255, 240, 247, 255, 237, 237, 255, 242, 237, 255, 244, 237, 255, 243, 235, 255, 241, 236, 255, 240, 238, 255, 239, 239, 255, 237, 240,
				255, 238, 242, 255, 240, 243, 255, 241, 243, 255, 241, 241, 255, 241, 239, 255, 241, 240, 255, 241, 239, 255, 241, 240, 255, 241, 239,
				255, 241, 240, 255, 241, 239, 255, 241, 240, 255, 241, 239, 255, 241, 240, 255, 241, 240, 255, 241, 239, 255, 241, 240, 255, 241, 239,
				255, 241, 240, 255, 241, 239, 255, 242, 239, 255, 243, 238, 254, 243, 237, 254, 244, 238, 255, 244, 239, 255, 241, 239, 255, 237, 239,
				255, 235, 239, 255, 236, 239, 218, 199, 199, 232, 216, 230, 255, 244, 255, 255, 247, 255, 255, 247, 253, 255, 252, 253, 252, 253, 249,
				252, 254, 247, 252, 254, 247, 254, 252, 248, 255, 251, 249, 255, 249, 249, 255, 248, 250, 255, 248, 252, 255, 249, 253, 255, 250, 253,
				255, 251, 252, 255, 251, 250, 255, 251, 252, 255, 251, 250, 255, 251, 252, 255, 251, 250, 255, 251, 251, 255, 251, 250, 255, 251, 251,
				255, 251, 251, 255, 251, 251, 255, 251, 251, 255, 251, 251, 255, 251, 251, 255, 251, 250, 255, 251, 251, 255, 252, 250, 255, 252, 249,
				254, 253, 248, 251, 253, 247, 252, 253, 248, 254, 253, 248, 255, 251, 248, 255, 247, 247, 255, 245, 245, 255, 247, 247, 214, 203, 202,
				235, 216, 227, 255, 246, 255, 255, 248, 255, 255, 243, 247, 255, 252, 254, 245, 251, 248, 244, 253, 249, 245, 255, 250, 250, 255, 250,
				254, 254, 250, 255, 252, 251, 255, 251, 252, 255, 251, 252, 254, 252, 253, 254, 253, 253, 254, 253, 253, 254, 254, 252, 254, 253, 253,
				254, 254, 252, 254, 253, 253, 254, 254, 252, 254, 253, 253, 254, 253, 252, 254, 253, 253, 254, 253, 252, 254, 253, 253, 254, 253, 253,
				254, 253, 252, 254, 253, 253, 254, 253, 252, 254, 253, 253, 253, 254, 252, 254, 255, 252, 251, 255, 251, 250, 255, 250, 250, 255, 250,
				251, 255, 250, 253, 255, 249, 254, 253, 247, 255, 251, 244, 255, 251, 244, 211, 203, 195, 240, 219, 225, 255, 250, 252, 255, 250, 252,
				254, 243, 245, 255, 252, 253, 248, 255, 252, 243, 255, 251, 242, 255, 250, 247, 254, 250, 252, 253, 250, 253, 252, 250, 253, 252, 250,
				253, 252, 250, 253, 252, 250, 252, 252, 250, 252, 253, 250, 252, 253, 250, 252, 252, 252, 252, 253, 250, 252, 253, 252, 252, 253, 250,
				252, 253, 252, 252, 253, 251, 252, 253, 251, 252, 253, 251, 252, 253, 251, 252, 253, 251, 252, 253, 251, 252, 253, 251, 252, 253, 251,
				252, 253, 252, 251, 254, 251, 251, 255, 251, 250, 255, 251, 250, 255, 249, 248, 255, 249, 248, 255, 249, 250, 255, 247, 252, 253, 243,
				253, 251, 240, 254, 252, 240, 208, 202, 189, 240, 221, 220, 255, 251, 249, 255, 247, 247, 255, 246, 247, 255, 249, 249, 252, 254, 252,
				247, 255, 253, 246, 255, 253, 252, 255, 253, 255, 254, 253, 255, 254, 252, 255, 255, 250, 255, 255, 250, 255, 255, 250, 255, 255, 250,
				255, 255, 251, 255, 255, 251, 255, 255, 253, 255, 255, 251, 255, 255, 253, 255, 255, 251, 255, 255, 252, 255, 255, 252, 255, 255, 252,
				255, 255, 252, 255, 255, 252, 255, 255, 252, 255, 255, 252, 255, 255, 252, 255, 255, 252, 255, 255, 253, 255, 255, 253, 255, 255, 253,
				254, 255, 253, 254, 255, 251, 252, 255, 251, 251, 255, 250, 252, 255, 248, 252, 255, 244, 252, 254, 240, 254, 254, 239, 205, 198, 183,
				246, 234, 228, 255, 254, 247, 255, 249, 248, 255, 250, 251, 254, 246, 247, 255, 253, 253, 249, 255, 254, 246, 255, 253, 251, 253, 253,
				255, 251, 252, 255, 251, 250, 253, 254, 249, 251, 255, 248, 250, 255, 248, 251, 255, 248, 253, 254, 249, 253, 253, 251, 253, 253, 251,
				253, 253, 251, 253, 253, 251, 253, 253, 251, 253, 253, 251, 253, 253, 251, 253, 253, 251, 253, 253, 251, 253, 253, 251, 253, 253, 251,
				253, 253, 251, 253, 253, 251, 253, 253, 251, 253, 253, 251, 253, 253, 252, 254, 254, 255, 254, 254, 255, 253, 255, 254, 252, 255, 253,
				251, 255, 251, 251, 255, 248, 251, 254, 244, 251, 252, 241, 253, 253, 240, 204, 196, 183, 234, 237, 226, 246, 255, 245, 255, 254, 251,
				255, 249, 251, 255, 251, 254, 255, 254, 255, 250, 255, 255, 249, 255, 255, 253, 253, 255, 255, 251, 255, 254, 253, 254, 251, 255, 253,
				247, 255, 251, 246, 255, 250, 248, 255, 251, 251, 255, 254, 253, 255, 254, 253, 255, 254, 253, 255, 254, 253, 255, 254, 253, 255, 254,
				253, 255, 254, 253, 255, 254, 253, 255, 254, 253, 255, 254, 253, 255, 254, 253, 255, 254, 253, 255, 254, 253, 255, 254, 253, 255, 254,
				253, 255, 254, 253, 254, 255, 253, 254, 255, 252, 255, 255, 252, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 253, 251, 254, 249,
				253, 252, 245, 255, 250, 243, 206, 194, 188, 244, 245, 232, 254, 255, 244, 255, 249, 244, 255, 247, 249, 255, 240, 244, 255, 240, 242,
				255, 248, 250, 254, 251, 252, 255, 249, 251, 255, 247, 251, 255, 249, 251, 255, 252, 250, 254, 254, 248, 254, 255, 247, 254, 254, 249,
				255, 252, 250, 255, 252, 250, 255, 251, 251, 255, 252, 250, 255, 251, 251, 255, 252, 251, 255, 252, 251, 255, 252, 251, 255, 251, 250,
				255, 251, 250, 255, 251, 250, 255, 251, 250, 255, 251, 250, 255, 251, 250, 255, 251, 250, 255, 250, 250, 255, 250, 251, 255, 249, 255,
				255, 250, 255, 255, 250, 255, 255, 251, 255, 255, 251, 252, 255, 251, 250, 255, 249, 246, 255, 247, 243, 255, 247, 243, 209, 193, 189,
				223, 205, 188, 237, 213, 199, 242, 204, 197, 254, 209, 208, 255, 208, 209, 255, 211, 212, 252, 209, 210, 251, 208, 208, 253, 206, 207,
				255, 205, 206, 253, 207, 205, 249, 210, 205, 244, 213, 204, 241, 214, 204, 242, 214, 204, 246, 211, 205, 248, 210, 205, 250, 209, 207,
				248, 210, 205, 250, 209, 207, 249, 210, 206, 250, 209, 207, 249, 210, 206, 249, 209, 206, 249, 209, 206, 249, 209, 206, 249, 209, 206,
				249, 209, 206, 249, 209, 206, 249, 209, 206, 250, 209, 207, 250, 208, 208, 250, 206, 211, 251, 207, 212, 250, 208, 212, 248, 209, 211,
				248, 209, 209, 248, 209, 207, 248, 207, 204, 248, 206, 202, 250, 210, 205, 210, 172, 166, 170, 123, 107, 170, 113, 101, 180, 109, 102,
				183, 104, 101, 186, 105, 104, 186, 106, 105, 185, 107, 105, 185, 107, 105, 188, 105, 104, 190, 104, 103, 188, 105, 102, 183, 108, 102,
				178, 111, 101, 174, 113, 102, 175, 113, 102, 179, 110, 102, 181, 109, 103, 182, 109, 103, 181, 109, 102, 182, 109, 103, 181, 109, 103,
				182, 109, 103, 181, 109, 103, 181, 108, 102, 181, 108, 102, 181, 108, 102, 181, 108, 102, 181, 108, 102, 181, 108, 102, 181, 108, 102,
				181, 108, 102, 183, 107, 104, 185, 104, 107, 185, 105, 107, 183, 106, 107, 181, 107, 106, 180, 108, 104, 180, 108, 104, 180, 107, 101,
				178, 107, 100, 182, 116, 108, 168, 111, 102, 156, 74, 60, 163, 67, 57, 176, 68, 62, 175, 63, 59, 176, 64, 58, 175, 64, 58, 177, 66,
				59, 178, 66, 59, 181, 65, 59, 182, 64, 59, 182, 65, 59, 179, 66, 59, 174, 68, 59, 170, 70, 59, 170, 70, 59, 173, 69, 59, 175, 67, 59,
				175, 67, 59, 175, 67, 59, 175, 67, 59, 175, 67, 59, 175, 67, 59, 175, 67, 59, 175, 67, 59, 175, 67, 59, 175, 67, 59, 175, 67, 59, 175,
				67, 59, 175, 67, 59, 175, 67, 59, 175, 67, 59, 177, 66, 60, 180, 63, 61, 179, 64, 61, 177, 66, 61, 174, 67, 60, 174, 68, 59, 173, 67,
				58, 174, 66, 58, 170, 68, 58, 160, 69, 57, 151, 77, 62, 173, 64, 55, 192, 66, 61, 191, 59, 55, 195, 63, 57, 188, 59, 50, 188, 60, 50,
				190, 60, 50, 192, 59, 50, 194, 59, 50, 195, 58, 50, 196, 57, 51, 196, 57, 51, 192, 59, 51, 187, 62, 52, 187, 62, 52, 189, 61, 52, 190,
				60, 52, 190, 60, 52, 190, 60, 52, 190, 60, 52, 190, 60, 52, 190, 60, 52, 190, 60, 52, 190, 60, 52, 190, 60, 52, 190, 60, 52, 190, 60,
				52, 190, 60, 52, 190, 60, 52, 190, 60, 52, 191, 60, 51, 192, 59, 50, 195, 57, 51, 194, 58, 50, 190, 60, 50, 188, 61, 50, 189, 61, 49,
				190, 60, 50, 191, 59, 50, 186, 62, 52, 175, 66, 54, 164, 77, 61, 180, 60, 59, 202, 63, 65, 191, 51, 52, 198, 61, 58, 188, 58, 51, 189,
				60, 50, 193, 60, 51, 194, 59, 50, 195, 59, 50, 197, 58, 50, 200, 56, 51, 202, 55, 52, 199, 56, 53, 194, 59, 53, 192, 60, 53, 194, 59,
				53, 194, 58, 52, 194, 58, 52, 194, 58, 52, 194, 58, 52, 194, 58, 52, 194, 58, 52, 194, 58, 52, 195, 59, 52, 195, 59, 52, 195, 59, 52,
				195, 59, 52, 195, 59, 52, 195, 59, 52, 195, 59, 52, 195, 59, 52, 197, 59, 50, 197, 58, 48, 196, 58, 48, 191, 61, 47, 191, 62, 47, 192,
				60, 48, 195, 59, 48, 198, 57, 50, 195, 59, 53, 182, 63, 55, 166, 71, 59, 179, 57, 59, 197, 53, 61, 193, 52, 55, 194, 57, 55, 188, 59,
				53, 185, 57, 49, 189, 58, 50, 192, 59, 51, 192, 58, 51, 194, 57, 51, 198, 55, 51, 201, 53, 53, 200, 54, 54, 196, 56, 54, 193, 57, 53,
				194, 57, 53, 194, 57, 53, 194, 57, 53, 194, 57, 53, 194, 57, 53, 194, 57, 53, 194, 57, 53, 194, 57, 53, 193, 57, 52, 193, 57, 52, 193,
				57, 52, 193, 57, 52, 193, 57, 52, 193, 57, 52, 193, 57, 52, 194, 57, 52, 194, 57, 50, 192, 57, 47, 191, 58, 46, 188, 60, 46, 188, 60,
				46, 191, 58, 46, 196, 56, 48, 198, 54, 51, 195, 56, 53, 181, 59, 55, 164, 68, 60, 179, 60, 60, 191, 52, 56, 197, 55, 56, 197, 56, 54,
				193, 59, 53, 187, 57, 48, 189, 58, 50, 191, 59, 51, 193, 58, 53, 196, 57, 53, 199, 55, 53, 201, 53, 52, 199, 53, 51, 196, 55, 52, 196,
				57, 52, 196, 56, 53, 196, 56, 53, 196, 56, 53, 196, 56, 53, 196, 56, 53, 196, 56, 53, 196, 56, 53, 196, 56, 53, 196, 56, 52, 195, 55,
				52, 195, 55, 52, 195, 55, 52, 195, 55, 52, 195, 55, 52, 195, 55, 52, 195, 55, 51, 193, 56, 50, 190, 57, 48, 189, 57, 46, 189, 57, 46,
				192, 57, 47, 196, 55, 47, 198, 54, 49, 198, 54, 52, 192, 56, 54, 178, 61, 56, 164, 71, 62, 178, 66, 62, 186, 57, 54, 193, 54, 52, 198,
				57, 52, 195, 59, 51, 191, 59, 50, 189, 60, 52, 189, 60, 53, 192, 60, 55, 195, 59, 55, 196, 56, 54, 196, 54, 51, 194, 54, 50, 192, 56,
				49, 193, 58, 51, 194, 57, 52, 194, 56, 52, 195, 57, 52, 195, 57, 53, 195, 57, 53, 195, 57, 53, 195, 57, 53, 195, 57, 53, 195, 57, 52,
				194, 56, 52, 194, 56, 52, 194, 56, 52, 194, 56, 52, 194, 56, 52, 194, 56, 52, 193, 56, 51, 190, 57, 51, 187, 59, 51, 187, 59, 50, 190,
				57, 50, 195, 56, 51, 198, 55, 51, 198, 54, 52, 195, 56, 54, 187, 60, 57, 172, 64, 58, 158, 72, 62, 173, 70, 64, 179, 61, 56, 187, 57,
				52, 192, 58, 53, 190, 61, 53, 185, 62, 52, 182, 63, 54, 180, 64, 56, 181, 63, 56, 183, 62, 57, 184, 61, 56, 185, 61, 56, 184, 61, 54,
				181, 61, 51, 181, 61, 52, 182, 61, 54, 183, 61, 54, 184, 62, 55, 184, 62, 55, 184, 62, 55, 184, 62, 55, 184, 62, 55, 184, 62, 55, 184,
				61, 55, 183, 61, 55, 183, 61, 54, 183, 61, 54, 183, 61, 54, 183, 61, 54, 183, 61, 54, 183, 61, 54, 180, 62, 54, 177, 65, 55, 178, 64,
				55, 182, 62, 55, 187, 61, 55, 190, 59, 55, 189, 59, 56, 185, 61, 58, 177, 66, 60, 165, 70, 61, 153, 76, 65, 168, 77, 69, 173, 69, 61,
				179, 64, 58, 182, 64, 57, 180, 65, 57, 174, 66, 56, 167, 64, 54, 162, 65, 55, 162, 68, 59, 164, 70, 62, 168, 71, 64, 171, 73, 65, 171,
				73, 63, 170, 72, 61, 167, 71, 60, 168, 72, 61, 168, 73, 62, 169, 73, 63, 169, 73, 63, 169, 73, 63, 169, 73, 63, 169, 73, 63, 169, 73,
				63, 169, 73, 63, 168, 73, 63, 168, 73, 62, 168, 72, 62, 168, 72, 62, 168, 72, 62, 168, 72, 62, 167, 72, 62, 166, 73, 62, 163, 76, 63,
				164, 75, 63, 168, 73, 63, 173, 71, 63, 176, 69, 63, 176, 69, 63, 173, 72, 64, 166, 75, 66, 155, 79, 67, 145, 84, 70,
			]
		),
	},
	{
		c: "ar",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				165, 185, 101, 145, 176, 130, 142, 178, 125, 142, 174, 123, 150, 170, 123, 155, 173, 124, 151, 174, 121, 146, 175, 123, 144, 175, 130,
				144, 174, 135, 147, 173, 132, 151, 173, 125, 150, 174, 121, 147, 176, 120, 146, 176, 121, 146, 175, 125, 146, 175, 127, 146, 175, 127,
				146, 175, 127, 146, 175, 127, 146, 175, 127, 146, 175, 127, 146, 175, 127, 146, 175, 127, 146, 175, 127, 146, 175, 127, 146, 175, 127,
				146, 175, 127, 146, 175, 127, 146, 175, 127, 146, 175, 127, 143, 176, 127, 141, 179, 128, 141, 179, 126, 146, 176, 122, 147, 175, 122,
				146, 176, 123, 144, 176, 126, 142, 177, 130, 143, 178, 128, 152, 180, 119, 174, 192, 104, 142, 180, 141, 119, 171, 181, 120, 175, 187,
				123, 174, 189, 131, 169, 188, 134, 169, 185, 130, 173, 179, 125, 176, 178, 122, 176, 185, 123, 174, 192, 126, 172, 191, 130, 172, 185,
				129, 173, 181, 126, 175, 180, 125, 175, 181, 124, 175, 183, 124, 175, 185, 124, 175, 185, 124, 175, 185, 124, 175, 185, 124, 175, 185,
				124, 175, 185, 124, 175, 185, 124, 175, 185, 124, 175, 185, 124, 175, 185, 124, 175, 185, 124, 175, 185, 124, 175, 185, 124, 175, 185,
				124, 175, 185, 124, 175, 187, 126, 174, 191, 128, 173, 190, 134, 171, 186, 134, 170, 183, 134, 170, 184, 132, 172, 187, 130, 173, 189,
				131, 173, 183, 132, 166, 161, 156, 178, 136, 133, 178, 163, 110, 170, 212, 111, 176, 222, 113, 173, 224, 119, 165, 221, 119, 162, 215,
				116, 170, 208, 112, 175, 206, 109, 175, 214, 110, 173, 220, 113, 171, 219, 117, 170, 215, 117, 171, 212, 114, 173, 212, 112, 173, 213,
				112, 172, 214, 112, 172, 215, 112, 172, 215, 112, 172, 215, 112, 172, 215, 112, 172, 215, 112, 172, 215, 112, 172, 215, 112, 172, 215,
				112, 172, 215, 112, 172, 215, 112, 172, 215, 112, 172, 215, 112, 172, 215, 112, 172, 215, 112, 172, 215, 112, 172, 217, 113, 171, 221,
				117, 168, 220, 122, 167, 212, 124, 166, 211, 124, 166, 213, 121, 167, 215, 119, 168, 217, 121, 168, 211, 128, 165, 192, 158, 183, 167,
				138, 181, 165, 113, 171, 215, 112, 174, 222, 115, 173, 228, 123, 166, 230, 126, 167, 228, 120, 171, 216, 113, 175, 211, 110, 176, 217,
				110, 175, 223, 114, 173, 221, 118, 171, 218, 118, 171, 218, 114, 173, 219, 113, 174, 220, 114, 173, 219, 114, 173, 219, 114, 173, 219,
				114, 173, 219, 114, 173, 219, 114, 173, 219, 114, 173, 219, 114, 173, 219, 114, 173, 219, 114, 173, 219, 114, 173, 219, 114, 173, 219,
				114, 173, 219, 114, 173, 219, 114, 173, 219, 114, 173, 219, 112, 174, 220, 111, 174, 220, 113, 172, 217, 119, 170, 211, 121, 169, 211,
				120, 169, 215, 118, 169, 219, 114, 170, 224, 117, 171, 220, 122, 164, 199, 153, 181, 172, 139, 176, 159, 112, 168, 211, 110, 171, 216,
				113, 170, 223, 123, 164, 231, 129, 166, 232, 120, 170, 218, 113, 173, 211, 109, 175, 215, 109, 174, 219, 114, 172, 218, 118, 170, 216,
				117, 170, 218, 114, 170, 222, 113, 171, 222, 114, 171, 219, 114, 171, 218, 116, 171, 218, 114, 171, 218, 116, 171, 218, 115, 171, 218,
				115, 171, 218, 115, 171, 218, 115, 171, 218, 115, 171, 218, 115, 171, 218, 115, 171, 218, 115, 171, 218, 115, 171, 218, 115, 171, 218,
				115, 171, 218, 113, 172, 218, 110, 174, 218, 111, 173, 214, 118, 170, 209, 120, 170, 208, 118, 170, 212, 115, 170, 217, 112, 171, 223,
				114, 172, 220, 120, 165, 199, 150, 180, 170, 144, 178, 165, 118, 171, 215, 115, 174, 217, 116, 170, 222, 123, 161, 230, 126, 160, 231,
				120, 168, 222, 113, 174, 216, 109, 176, 217, 109, 175, 219, 114, 173, 217, 119, 171, 216, 118, 170, 221, 115, 170, 228, 115, 170, 229,
				117, 170, 224, 117, 171, 221, 118, 170, 221, 117, 171, 221, 118, 170, 221, 117, 171, 221, 118, 170, 221, 117, 170, 221, 118, 170, 221,
				117, 170, 221, 117, 170, 221, 117, 170, 221, 117, 170, 221, 118, 170, 221, 117, 170, 221, 117, 170, 221, 115, 171, 223, 113, 173, 225,
				114, 173, 223, 121, 169, 215, 123, 169, 212, 121, 170, 215, 117, 171, 219, 113, 173, 224, 115, 174, 219, 123, 170, 199, 153, 184, 168,
				142, 176, 162, 117, 169, 209, 117, 173, 212, 120, 171, 218, 127, 163, 229, 129, 162, 234, 121, 168, 226, 114, 173, 219, 111, 175, 218,
				112, 175, 218, 116, 173, 216, 120, 171, 215, 120, 170, 220, 118, 170, 228, 118, 170, 229, 119, 170, 224, 119, 171, 221, 120, 170, 222,
				119, 170, 222, 120, 170, 223, 119, 170, 223, 119, 170, 223, 119, 171, 222, 119, 171, 222, 119, 171, 221, 119, 171, 221, 119, 171, 221,
				119, 171, 221, 119, 170, 221, 120, 170, 221, 120, 170, 222, 118, 170, 225, 117, 171, 228, 119, 171, 227, 123, 168, 218, 125, 168, 215,
				122, 169, 216, 119, 170, 217, 116, 172, 221, 117, 174, 213, 124, 169, 191, 153, 183, 157, 140, 175, 151, 116, 164, 191, 120, 168, 197,
				121, 164, 203, 128, 162, 218, 128, 162, 225, 120, 165, 222, 114, 168, 218, 113, 170, 215, 115, 170, 213, 117, 170, 208, 120, 169, 206,
				121, 168, 209, 121, 167, 214, 119, 166, 216, 116, 166, 212, 120, 172, 216, 117, 167, 214, 119, 168, 216, 117, 166, 216, 116, 165, 216,
				119, 170, 220, 117, 169, 216, 116, 170, 215, 115, 169, 212, 115, 169, 211, 117, 170, 212, 117, 169, 211, 118, 167, 212, 121, 167, 213,
				121, 165, 213, 120, 164, 216, 120, 165, 221, 121, 165, 220, 123, 164, 215, 123, 165, 212, 122, 166, 210, 120, 167, 208, 119, 168, 210,
				121, 169, 202, 124, 166, 176, 152, 182, 144, 156, 189, 154, 138, 178, 192, 143, 179, 197, 141, 174, 201, 144, 173, 215, 141, 172, 222,
				134, 174, 224, 130, 176, 224, 132, 177, 220, 134, 177, 215, 135, 178, 209, 136, 179, 206, 139, 178, 207, 141, 177, 210, 139, 177, 212,
				134, 177, 211, 138, 182, 217, 133, 174, 211, 138, 177, 216, 138, 176, 217, 138, 176, 216, 139, 180, 219, 134, 177, 214, 134, 180, 214,
				131, 179, 211, 129, 178, 209, 131, 180, 210, 132, 179, 211, 135, 177, 212, 138, 176, 213, 138, 173, 213, 138, 172, 216, 138, 174, 218,
				137, 174, 219, 137, 174, 219, 137, 175, 217, 137, 176, 211, 137, 176, 209, 137, 176, 211, 139, 176, 203, 143, 178, 180, 164, 193, 148,
				198, 220, 181, 189, 216, 223, 194, 216, 224, 195, 214, 229, 194, 212, 236, 189, 211, 239, 184, 213, 242, 181, 215, 242, 183, 215, 239,
				186, 215, 236, 186, 216, 232, 186, 217, 230, 188, 216, 230, 192, 214, 233, 191, 214, 234, 190, 215, 235, 189, 214, 236, 190, 210, 232,
				194, 209, 231, 192, 204, 224, 184, 195, 213, 182, 195, 212, 185, 202, 219, 191, 211, 229, 188, 212, 231, 184, 212, 231, 183, 213, 232,
				186, 214, 233, 188, 214, 234, 188, 211, 234, 189, 210, 235, 191, 213, 236, 187, 213, 236, 185, 214, 237, 185, 213, 238, 184, 214, 237,
				183, 215, 233, 183, 215, 232, 184, 214, 234, 186, 214, 230, 187, 215, 213, 196, 219, 178, 240, 249, 211, 234, 248, 252, 239, 247, 250,
				244, 250, 255, 243, 248, 255, 239, 247, 255, 235, 250, 255, 233, 252, 255, 235, 252, 255, 237, 251, 255, 237, 252, 255, 236, 252, 255,
				238, 252, 255, 241, 249, 255, 242, 249, 255, 243, 249, 255, 243, 246, 255, 247, 244, 249, 229, 218, 218, 209, 191, 184, 188, 168, 159,
				186, 165, 156, 203, 187, 180, 228, 217, 216, 241, 237, 241, 242, 245, 252, 240, 248, 255, 241, 250, 255, 241, 250, 255, 239, 247, 255,
				240, 247, 255, 241, 252, 255, 237, 252, 254, 234, 254, 253, 234, 252, 255, 233, 252, 255, 232, 253, 255, 231, 253, 255, 231, 252, 255,
				232, 252, 255, 231, 249, 247, 230, 244, 210, 253, 255, 221, 246, 252, 255, 250, 250, 252, 255, 254, 255, 254, 253, 255, 253, 254, 254,
				248, 254, 254, 246, 255, 254, 248, 254, 254, 250, 254, 253, 249, 255, 253, 247, 255, 254, 248, 253, 255, 251, 251, 255, 252, 251, 255,
				252, 251, 255, 254, 252, 252, 246, 233, 226, 184, 160, 141, 158, 123, 92, 149, 110, 74, 145, 106, 71, 149, 113, 84, 194, 166, 147,
				237, 219, 210, 253, 246, 245, 253, 253, 255, 251, 254, 255, 249, 254, 255, 247, 252, 255, 248, 252, 255, 249, 255, 253, 248, 255, 249,
				248, 255, 247, 248, 255, 253, 246, 255, 254, 245, 255, 254, 245, 255, 255, 244, 254, 255, 244, 254, 255, 246, 255, 252, 243, 249, 216,
				255, 255, 228, 250, 254, 255, 254, 252, 255, 255, 253, 255, 255, 253, 252, 255, 253, 250, 253, 254, 251, 252, 255, 250, 254, 255, 249,
				255, 255, 249, 255, 255, 250, 253, 255, 252, 252, 254, 255, 254, 252, 255, 253, 251, 255, 251, 250, 255, 251, 248, 246, 219, 201, 183,
				136, 106, 71, 139, 97, 48, 167, 119, 63, 166, 117, 61, 140, 96, 47, 159, 124, 91, 215, 193, 174, 250, 241, 235, 253, 254, 255, 249,
				254, 255, 247, 255, 255, 245, 255, 255, 248, 255, 254, 250, 255, 249, 254, 255, 244, 254, 255, 243, 254, 255, 248, 254, 255, 250, 252,
				255, 249, 252, 255, 253, 251, 253, 255, 251, 253, 255, 252, 255, 247, 246, 246, 206, 254, 254, 227, 246, 249, 255, 254, 251, 255, 255,
				251, 253, 255, 252, 249, 254, 251, 245, 254, 254, 245, 254, 255, 245, 255, 254, 245, 255, 254, 245, 254, 254, 247, 253, 254, 251, 253,
				253, 254, 254, 251, 255, 254, 251, 255, 254, 252, 253, 245, 238, 233, 195, 173, 149, 124, 89, 49, 154, 105, 49, 188, 133, 69, 188,
				132, 69, 153, 103, 48, 142, 103, 64, 198, 172, 150, 246, 235, 228, 250, 251, 254, 246, 252, 255, 246, 255, 255, 245, 254, 254, 249,
				255, 251, 252, 255, 246, 255, 255, 244, 255, 253, 244, 255, 253, 248, 255, 253, 249, 255, 254, 247, 255, 253, 249, 255, 252, 254, 255,
				253, 254, 255, 254, 241, 248, 245, 194, 250, 252, 223, 243, 250, 255, 253, 254, 255, 253, 252, 255, 255, 254, 252, 255, 255, 249, 254,
				255, 246, 254, 255, 245, 255, 254, 245, 255, 253, 246, 254, 253, 249, 253, 253, 253, 252, 252, 255, 251, 251, 255, 252, 251, 255, 254,
				250, 252, 247, 234, 232, 202, 174, 155, 144, 103, 67, 175, 122, 70, 195, 134, 76, 200, 139, 83, 175, 121, 73, 152, 108, 74, 201, 171,
				153, 248, 233, 230, 251, 247, 254, 248, 250, 255, 250, 254, 255, 249, 253, 253, 254, 254, 249, 255, 255, 247, 255, 254, 248, 255, 253,
				250, 255, 253, 251, 255, 253, 251, 255, 254, 248, 255, 254, 248, 255, 253, 253, 255, 254, 249, 255, 255, 231, 247, 243, 179, 249, 252,
				217, 242, 250, 255, 252, 255, 255, 247, 246, 251, 254, 253, 254, 255, 255, 252, 254, 255, 250, 255, 255, 250, 255, 254, 250, 255, 253,
				250, 255, 253, 252, 253, 254, 254, 251, 254, 255, 251, 253, 255, 251, 251, 254, 247, 246, 251, 252, 247, 244, 219, 193, 178, 141, 103,
				75, 153, 102, 61, 164, 107, 61, 169, 112, 67, 136, 86, 48, 146, 107, 82, 211, 185, 172, 251, 240, 237, 252, 250, 254, 250, 251, 255,
				254, 253, 255, 254, 252, 253, 255, 252, 249, 255, 253, 250, 255, 253, 250, 255, 254, 252, 255, 253, 254, 255, 254, 252, 255, 255, 248,
				255, 254, 247, 255, 253, 251, 255, 254, 246, 255, 255, 227, 247, 244, 174, 254, 255, 210, 241, 251, 253, 252, 255, 255, 248, 249, 255,
				254, 254, 255, 255, 255, 255, 253, 254, 252, 253, 253, 251, 254, 252, 253, 255, 252, 254, 254, 253, 255, 252, 254, 255, 251, 255, 255,
				251, 255, 255, 250, 253, 253, 246, 246, 248, 255, 252, 249, 252, 233, 223, 193, 162, 144, 143, 101, 77, 130, 84, 58, 139, 96, 70, 146,
				109, 87, 197, 172, 155, 235, 222, 213, 250, 245, 243, 254, 255, 255, 251, 253, 255, 252, 252, 255, 255, 252, 254, 255, 251, 251, 254,
				252, 250, 251, 255, 252, 246, 255, 255, 247, 255, 255, 247, 255, 255, 248, 255, 251, 250, 255, 250, 251, 255, 253, 252, 255, 248, 253,
				255, 228, 244, 244, 172, 246, 254, 201, 243, 255, 255, 247, 255, 255, 247, 254, 255, 248, 255, 255, 247, 255, 255, 247, 255, 255, 247,
				255, 255, 251, 253, 255, 253, 252, 255, 251, 253, 255, 246, 255, 255, 245, 255, 255, 245, 255, 255, 245, 255, 255, 245, 254, 254, 248,
				255, 254, 254, 252, 251, 236, 225, 222, 210, 189, 186, 195, 172, 167, 201, 180, 175, 212, 197, 193, 230, 226, 225, 243, 247, 247, 246,
				254, 254, 244, 255, 255, 243, 255, 255, 246, 255, 255, 252, 254, 255, 255, 253, 255, 252, 254, 255, 244, 255, 255, 239, 255, 255, 239,
				255, 255, 240, 255, 255, 241, 255, 255, 244, 255, 255, 245, 255, 255, 247, 255, 254, 250, 255, 237, 245, 247, 183, 209, 225, 176, 204,
				226, 237, 208, 230, 250, 204, 225, 248, 205, 226, 247, 205, 227, 246, 206, 230, 248, 207, 230, 248, 210, 227, 249, 212, 225, 250, 210,
				226, 250, 207, 228, 249, 205, 230, 246, 204, 231, 242, 202, 232, 241, 200, 232, 242, 197, 228, 239, 205, 228, 242, 213, 231, 246, 209,
				221, 238, 198, 208, 227, 198, 209, 228, 204, 222, 239, 203, 227, 243, 200, 230, 244, 198, 232, 244, 196, 231, 242, 196, 229, 241, 200,
				228, 241, 206, 228, 241, 211, 227, 242, 209, 226, 242, 201, 228, 243, 197, 229, 246, 197, 229, 247, 198, 228, 246, 201, 228, 242, 202,
				227, 241, 205, 225, 245, 208, 225, 239, 211, 227, 217, 215, 224, 171, 159, 181, 141, 146, 178, 201, 145, 177, 212, 139, 173, 212, 142,
				177, 211, 143, 180, 211, 138, 177, 207, 138, 175, 207, 142, 172, 209, 144, 170, 210, 142, 171, 210, 139, 173, 208, 136, 174, 203, 134,
				175, 197, 134, 177, 198, 134, 181, 202, 131, 177, 202, 134, 175, 205, 141, 179, 211, 145, 180, 216, 142, 176, 215, 138, 175, 212, 136,
				175, 211, 136, 179, 210, 133, 180, 207, 131, 179, 204, 131, 180, 203, 135, 181, 204, 139, 181, 205, 142, 179, 205, 145, 176, 206, 144,
				176, 207, 140, 178, 208, 137, 179, 210, 137, 178, 212, 139, 178, 211, 141, 178, 207, 143, 177, 206, 146, 175, 209, 149, 174, 201, 155,
				177, 179, 174, 189, 146, 143, 172, 145, 130, 170, 206, 127, 170, 217, 120, 165, 217, 119, 168, 213, 118, 169, 210, 118, 172, 211, 121,
				172, 213, 126, 169, 216, 129, 167, 219, 126, 168, 220, 122, 169, 216, 120, 171, 212, 120, 172, 206, 119, 172, 206, 120, 171, 209, 120,
				170, 211, 118, 167, 212, 117, 166, 214, 120, 167, 220, 123, 169, 223, 121, 168, 221, 117, 164, 216, 119, 168, 216, 120, 169, 213, 119,
				168, 210, 121, 169, 209, 123, 171, 209, 124, 170, 210, 122, 167, 209, 122, 165, 209, 123, 166, 211, 124, 169, 213, 124, 169, 214, 123,
				169, 217, 124, 169, 215, 124, 169, 212, 127, 168, 211, 130, 166, 213, 133, 166, 205, 134, 165, 176, 158, 179, 143, 140, 168, 154, 125,
				166, 215, 122, 169, 228, 117, 168, 228, 114, 171, 223, 111, 172, 217, 110, 174, 216, 112, 174, 217, 118, 171, 222, 121, 168, 226, 119,
				168, 227, 115, 170, 226, 114, 172, 222, 114, 173, 216, 116, 172, 216, 120, 173, 220, 118, 171, 221, 116, 170, 223, 116, 171, 226, 117,
				171, 229, 117, 170, 229, 118, 169, 228, 119, 170, 227, 122, 171, 226, 123, 170, 223, 123, 169, 220, 123, 169, 219, 122, 170, 219, 120,
				169, 220, 117, 168, 220, 116, 169, 222, 118, 171, 224, 121, 171, 220, 121, 171, 220, 120, 170, 224, 120, 170, 223, 121, 171, 220, 122,
				170, 220, 126, 168, 222, 129, 168, 213, 131, 168, 185, 156, 183, 151, 147, 169, 162, 125, 161, 216, 121, 164, 227, 117, 167, 229, 116,
				172, 223, 113, 175, 218, 111, 176, 215, 112, 176, 214, 117, 172, 220, 121, 169, 226, 120, 169, 228, 117, 170, 228, 116, 171, 225, 115,
				173, 221, 117, 173, 220, 118, 171, 221, 114, 168, 219, 113, 170, 221, 115, 174, 225, 114, 174, 227, 111, 170, 222, 114, 169, 221, 120,
				171, 223, 122, 169, 221, 124, 167, 219, 125, 167, 219, 125, 168, 219, 121, 168, 220, 116, 170, 221, 113, 172, 225, 112, 175, 228, 114,
				176, 226, 117, 172, 217, 118, 171, 216, 118, 171, 221, 117, 171, 222, 117, 171, 219, 118, 171, 219, 121, 168, 223, 124, 168, 214, 127,
				169, 186, 151, 183, 153, 156, 172, 169, 128, 160, 216, 121, 163, 227, 117, 167, 228, 116, 173, 220, 114, 174, 213, 113, 175, 211, 114,
				174, 212, 119, 170, 217, 122, 168, 223, 121, 168, 226, 119, 169, 226, 118, 171, 223, 118, 173, 220, 118, 172, 219, 117, 170, 219, 115,
				169, 218, 113, 170, 218, 112, 173, 218, 112, 173, 219, 111, 173, 217, 116, 172, 217, 120, 171, 216, 120, 166, 212, 122, 165, 212, 126,
				167, 215, 125, 168, 217, 121, 169, 218, 116, 171, 220, 111, 174, 223, 107, 175, 223, 108, 173, 219, 116, 171, 214, 118, 170, 213, 117,
				170, 217, 115, 170, 218, 114, 171, 217, 115, 171, 218, 117, 169, 223, 122, 168, 214, 125, 167, 187, 149, 181, 154, 154, 172, 165, 127,
				162, 214, 121, 170, 232, 113, 170, 229, 114, 174, 220, 113, 173, 210, 116, 171, 212, 119, 169, 216, 121, 167, 220, 122, 167, 222, 120,
				168, 223, 117, 170, 221, 116, 171, 219, 116, 172, 218, 116, 172, 217, 117, 171, 218, 117, 171, 218, 116, 171, 217, 112, 171, 215, 113,
				172, 215, 114, 174, 216, 118, 173, 216, 119, 171, 215, 119, 168, 212, 121, 168, 213, 123, 169, 215, 122, 170, 216, 119, 171, 217, 116,
				172, 219, 113, 174, 219, 109, 173, 218, 110, 170, 216, 118, 169, 217, 120, 169, 216, 117, 170, 216, 114, 171, 217, 113, 171, 220, 114,
				170, 222, 117, 168, 226, 123, 167, 218, 130, 165, 193, 156, 179, 161, 149, 171, 152, 124, 162, 201, 120, 175, 224, 108, 171, 218, 115,
				176, 209, 118, 174, 202, 124, 170, 209, 127, 167, 216, 128, 167, 217, 125, 168, 215, 122, 170, 212, 119, 172, 210, 117, 173, 209, 117,
				174, 209, 118, 173, 209, 121, 172, 209, 121, 172, 209, 121, 172, 210, 120, 173, 208, 120, 172, 208, 120, 173, 208, 121, 172, 208, 121,
				172, 208, 122, 172, 208, 122, 172, 208, 122, 172, 208, 122, 172, 208, 121, 172, 209, 121, 172, 210, 120, 173, 209, 120, 173, 210, 121,
				171, 211, 125, 167, 213, 125, 167, 212, 121, 170, 208, 117, 172, 208, 114, 172, 213, 115, 171, 217, 120, 168, 220, 128, 165, 212, 137,
				161, 188, 163, 174, 157, 156, 174, 132, 131, 163, 172, 124, 173, 188, 115, 169, 183, 123, 175, 176, 128, 174, 174, 133, 168, 183, 136,
				165, 189, 135, 166, 188, 132, 168, 184, 129, 170, 181, 127, 172, 178, 125, 172, 178, 125, 172, 180, 126, 171, 181, 128, 171, 182, 128,
				171, 182, 129, 170, 183, 128, 171, 182, 129, 170, 183, 129, 171, 182, 129, 170, 183, 129, 171, 182, 130, 171, 183, 130, 171, 183, 130,
				171, 183, 130, 171, 183, 130, 171, 183, 130, 171, 184, 129, 171, 183, 130, 170, 184, 132, 169, 184, 134, 165, 186, 134, 166, 183, 128,
				169, 177, 124, 171, 177, 121, 172, 181, 122, 171, 184, 127, 168, 187, 135, 165, 180, 143, 160, 159, 168, 173, 133, 176, 182, 108, 156,
				175, 137, 150, 183, 145, 141, 180, 140, 149, 184, 137, 153, 182, 138, 156, 177, 147, 157, 173, 152, 156, 175, 150, 153, 177, 144, 151,
				179, 141, 149, 180, 139, 148, 180, 140, 149, 180, 143, 150, 178, 145, 149, 176, 146, 149, 176, 146, 150, 175, 147, 149, 176, 146, 150,
				175, 147, 149, 176, 146, 150, 175, 147, 150, 175, 146, 152, 177, 149, 153, 178, 150, 153, 178, 150, 153, 178, 150, 153, 178, 150, 153,
				178, 150, 152, 178, 149, 154, 178, 150, 155, 177, 148, 157, 173, 146, 155, 175, 143, 151, 178, 137, 147, 181, 135, 144, 182, 137, 144,
				181, 139, 148, 179, 142, 154, 176, 137, 163, 173, 124, 184, 183, 104,
			]
		),
	},
	{
		c: "be",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				19, 12, 0, 44, 39, 20, 48, 49, 31, 47, 48, 30, 52, 45, 27, 53, 46, 28, 47, 48, 32, 46, 47, 29, 50, 44, 22, 51, 40, 22, 46, 33, 24, 55,
				43, 29, 65, 55, 28, 15, 3, 0, 252, 230, 119, 235, 208, 67, 235, 212, 57, 239, 214, 59, 237, 210, 59, 237, 212, 58, 236, 217, 53, 234,
				219, 56, 233, 216, 66, 235, 213, 68, 238, 212, 65, 239, 211, 67, 243, 216, 75, 253, 207, 95, 173, 93, 34, 169, 74, 44, 161, 78, 48,
				159, 74, 43, 172, 75, 42, 176, 73, 40, 174, 72, 47, 170, 70, 46, 173, 71, 49, 170, 70, 47, 166, 67, 44, 167, 71, 47, 169, 70, 49, 147,
				70, 42, 7, 1, 0, 50, 46, 35, 28, 29, 24, 27, 27, 27, 33, 25, 23, 33, 25, 23, 29, 30, 25, 28, 31, 24, 32, 28, 17, 34, 25, 16, 39, 27,
				27, 47, 34, 28, 64, 54, 29, 25, 11, 0, 235, 211, 79, 241, 213, 43, 246, 221, 33, 247, 218, 26, 246, 212, 26, 246, 212, 27, 244, 214,
				28, 244, 216, 31, 244, 215, 36, 245, 213, 40, 247, 211, 39, 248, 210, 39, 240, 202, 29, 255, 211, 75, 176, 74, 10, 186, 66, 39, 183,
				72, 44, 180, 65, 36, 191, 64, 32, 193, 57, 31, 197, 60, 44, 198, 57, 47, 200, 59, 50, 197, 59, 49, 194, 57, 47, 195, 61, 50, 193, 60,
				51, 163, 60, 41, 7, 0, 0, 48, 44, 35, 34, 34, 26, 33, 33, 25, 39, 30, 23, 38, 31, 23, 32, 35, 24, 31, 37, 23, 35, 35, 23, 37, 32, 26,
				40, 29, 35, 43, 31, 35, 60, 47, 38, 23, 6, 0, 243, 216, 87, 249, 217, 44, 247, 216, 29, 249, 216, 25, 253, 215, 30, 253, 214, 35, 250,
				214, 40, 250, 214, 40, 248, 215, 40, 248, 215, 40, 251, 213, 40, 250, 213, 36, 246, 210, 26, 255, 210, 64, 191, 81, 22, 192, 61, 43,
				185, 58, 39, 184, 54, 32, 205, 63, 39, 207, 61, 38, 201, 55, 42, 200, 53, 45, 203, 54, 48, 202, 53, 47, 199, 51, 47, 203, 55, 51, 202,
				54, 50, 168, 55, 39, 11, 5, 0, 39, 34, 30, 38, 35, 30, 37, 32, 26, 40, 29, 23, 38, 29, 20, 30, 34, 19, 28, 35, 19, 31, 33, 19, 33, 30,
				23, 36, 26, 34, 43, 31, 41, 59, 47, 47, 26, 9, 0, 244, 217, 86, 244, 213, 35, 239, 206, 17, 253, 219, 24, 250, 216, 23, 250, 215, 29,
				248, 212, 36, 248, 212, 38, 246, 214, 33, 245, 215, 33, 245, 214, 35, 244, 214, 30, 252, 222, 26, 254, 197, 45, 196, 85, 30, 192, 57,
				51, 191, 60, 52, 191, 57, 46, 209, 63, 48, 194, 47, 31, 197, 57, 44, 196, 55, 45, 198, 55, 47, 197, 53, 45, 196, 51, 46, 203, 55, 51,
				203, 54, 50, 168, 55, 39, 9, 3, 0, 42, 33, 34, 41, 32, 37, 39, 27, 31, 43, 24, 28, 41, 27, 26, 32, 32, 20, 27, 34, 16, 30, 33, 16, 34,
				32, 20, 37, 31, 33, 41, 31, 39, 58, 48, 49, 18, 4, 0, 245, 222, 84, 242, 214, 27, 245, 215, 23, 249, 220, 20, 246, 220, 11, 246, 219,
				14, 246, 217, 25, 245, 217, 29, 243, 219, 23, 242, 220, 23, 238, 219, 28, 237, 221, 24, 238, 222, 15, 255, 211, 54, 184, 79, 31, 193,
				62, 67, 185, 59, 62, 188, 60, 61, 194, 56, 54, 192, 57, 51, 183, 61, 48, 183, 66, 49, 183, 61, 46, 188, 65, 50, 189, 61, 50, 191, 58,
				49, 199, 57, 53, 160, 53, 37, 10, 3, 0, 45, 36, 41, 43, 30, 39, 42, 25, 35, 44, 23, 32, 42, 26, 29, 34, 31, 22, 29, 33, 16, 31, 32,
				14, 34, 32, 19, 37, 32, 29, 39, 33, 37, 57, 48, 51, 17, 4, 0, 244, 223, 80, 240, 215, 24, 244, 215, 23, 248, 220, 23, 246, 219, 14,
				246, 219, 16, 247, 216, 29, 247, 216, 30, 246, 217, 25, 242, 220, 23, 237, 220, 26, 235, 221, 24, 237, 223, 13, 254, 212, 52, 184, 79,
				31, 193, 62, 68, 185, 59, 63, 188, 59, 63, 191, 57, 56, 191, 58, 53, 183, 61, 48, 183, 66, 49, 183, 61, 46, 187, 64, 49, 186, 62, 50,
				191, 58, 49, 202, 57, 54, 164, 54, 39, 8, 1, 0, 47, 36, 44, 45, 29, 39, 44, 24, 35, 45, 21, 34, 44, 25, 31, 35, 30, 24, 30, 32, 18,
				33, 32, 12, 35, 32, 17, 37, 32, 28, 39, 33, 35, 57, 48, 53, 17, 4, 0, 241, 225, 78, 237, 217, 22, 241, 216, 28, 248, 218, 34, 249,
				215, 30, 252, 213, 34, 254, 210, 43, 254, 209, 45, 253, 212, 36, 249, 215, 32, 244, 215, 33, 241, 218, 28, 241, 220, 17, 255, 209, 52,
				189, 77, 27, 200, 60, 61, 191, 57, 56, 192, 59, 54, 195, 57, 47, 197, 57, 44, 196, 55, 46, 198, 57, 48, 195, 54, 47, 196, 57, 50, 195,
				56, 49, 199, 54, 49, 212, 54, 55, 172, 51, 40, 8, 0, 0, 47, 36, 44, 43, 30, 39, 42, 25, 35, 45, 21, 35, 44, 24, 33, 35, 30, 27, 31,
				31, 21, 34, 31, 16, 37, 31, 17, 39, 32, 26, 41, 33, 31, 57, 48, 53, 17, 4, 0, 241, 226, 73, 237, 218, 18, 240, 216, 30, 247, 218, 38,
				247, 215, 34, 252, 212, 37, 255, 209, 45, 255, 208, 45, 255, 210, 37, 252, 213, 34, 245, 215, 33, 242, 217, 28, 242, 219, 19, 255,
				208, 52, 192, 77, 23, 203, 60, 56, 194, 56, 53, 193, 59, 50, 195, 57, 44, 198, 56, 42, 202, 53, 46, 203, 54, 48, 196, 51, 46, 198, 55,
				49, 194, 55, 48, 200, 55, 50, 215, 52, 55, 175, 51, 41, 11, 2, 0, 50, 39, 47, 42, 31, 37, 41, 26, 33, 44, 21, 37, 44, 23, 38, 35, 29,
				33, 31, 30, 26, 34, 30, 21, 38, 29, 20, 40, 31, 26, 42, 32, 30, 58, 47, 51, 18, 4, 0, 242, 227, 66, 239, 219, 11, 241, 216, 27, 245,
				219, 36, 243, 218, 27, 246, 217, 27, 252, 213, 30, 254, 212, 30, 253, 213, 29, 250, 215, 27, 242, 217, 28, 239, 219, 26, 241, 219, 20,
				255, 208, 55, 191, 78, 20, 203, 60, 52, 194, 56, 53, 192, 59, 54, 192, 58, 49, 194, 57, 47, 198, 55, 47, 199, 56, 48, 191, 54, 46,
				190, 59, 49, 186, 59, 50, 193, 58, 52, 212, 54, 55, 174, 52, 41, 12, 1, 0, 48, 37, 43, 39, 34, 30, 38, 28, 27, 41, 23, 35, 41, 24, 40,
				34, 29, 36, 31, 29, 32, 36, 28, 26, 39, 28, 24, 41, 30, 28, 45, 31, 31, 61, 46, 51, 20, 4, 0, 244, 227, 62, 240, 219, 8, 241, 216, 27,
				244, 220, 36, 239, 221, 27, 240, 220, 25, 249, 216, 25, 252, 214, 27, 252, 214, 27, 249, 216, 27, 241, 218, 28, 238, 220, 26, 239,
				219, 26, 255, 208, 57, 192, 77, 20, 203, 61, 51, 194, 57, 51, 193, 58, 54, 191, 58, 49, 194, 57, 47, 196, 55, 46, 198, 57, 48, 189,
				56, 47, 186, 62, 50, 181, 63, 51, 188, 60, 51, 209, 55, 55, 172, 51, 40, 10, 0, 0, 45, 36, 37, 38, 36, 21, 34, 32, 17, 38, 26, 28, 39,
				26, 36, 32, 29, 36, 30, 29, 34, 36, 27, 30, 39, 27, 29, 43, 28, 31, 46, 29, 35, 62, 44, 56, 21, 3, 0, 245, 226, 62, 242, 217, 10, 243,
				214, 32, 244, 218, 43, 236, 221, 34, 238, 221, 30, 246, 216, 30, 250, 214, 30, 252, 213, 32, 249, 215, 32, 241, 217, 31, 238, 219, 31,
				239, 218, 31, 255, 206, 62, 193, 77, 18, 206, 60, 47, 197, 56, 49, 195, 58, 52, 192, 58, 47, 194, 57, 47, 198, 54, 46, 200, 57, 49,
				190, 57, 48, 186, 64, 51, 181, 65, 52, 187, 60, 51, 208, 54, 56, 172, 49, 41, 11, 1, 0, 46, 38, 36, 36, 37, 19, 34, 33, 15, 38, 27,
				25, 38, 27, 31, 32, 30, 33, 30, 30, 32, 36, 27, 30, 39, 27, 31, 43, 28, 31, 45, 30, 35, 62, 44, 56, 21, 2, 0, 245, 225, 68, 242, 217,
				13, 244, 214, 32, 245, 218, 43, 238, 219, 37, 239, 219, 34, 245, 217, 32, 249, 215, 30, 250, 214, 32, 247, 215, 34, 242, 216, 33, 241,
				217, 33, 242, 216, 33, 255, 205, 62, 193, 77, 18, 204, 61, 47, 195, 57, 47, 193, 59, 50, 194, 57, 47, 195, 57, 47, 197, 54, 46, 199,
				58, 51, 190, 57, 48, 190, 64, 52, 184, 63, 52, 188, 60, 51, 206, 54, 53, 169, 48, 37, 6, 0, 0, 44, 39, 36, 36, 36, 26, 35, 31, 22, 40,
				26, 23, 41, 27, 27, 35, 29, 29, 31, 29, 30, 36, 27, 28, 38, 28, 29, 40, 30, 29, 42, 32, 31, 58, 47, 53, 18, 3, 0, 244, 224, 73, 240,
				216, 18, 245, 214, 28, 248, 217, 38, 243, 217, 34, 243, 217, 32, 246, 216, 32, 247, 216, 30, 247, 216, 29, 246, 217, 29, 244, 215, 35,
				244, 215, 35, 245, 215, 29, 255, 206, 61, 191, 78, 20, 199, 63, 49, 190, 60, 47, 191, 60, 50, 194, 57, 49, 197, 56, 49, 195, 56, 49,
				196, 59, 53, 192, 57, 51, 193, 60, 53, 190, 59, 51, 191, 56, 50, 201, 53, 51, 162, 49, 33, 9, 3, 0, 44, 40, 37, 38, 34, 31, 35, 30,
				26, 41, 26, 23, 42, 26, 26, 35, 30, 27, 33, 29, 28, 36, 27, 28, 38, 28, 27, 39, 31, 28, 41, 33, 30, 57, 48, 53, 17, 4, 0, 242, 225,
				77, 240, 216, 20, 245, 214, 28, 249, 217, 34, 246, 216, 32, 245, 217, 32, 246, 216, 32, 246, 216, 30, 246, 217, 25, 246, 217, 27, 245,
				214, 35, 245, 214, 35, 246, 215, 28, 255, 206, 59, 189, 79, 20, 196, 64, 49, 188, 60, 47, 189, 61, 48, 195, 56, 51, 197, 55, 51, 193,
				56, 50, 193, 58, 52, 192, 55, 49, 195, 58, 52, 192, 57, 51, 194, 57, 51, 201, 56, 51, 163, 53, 36, 6, 0, 0, 38, 34, 31, 38, 34, 31,
				35, 30, 26, 41, 26, 23, 42, 26, 26, 35, 30, 27, 33, 29, 28, 36, 27, 28, 38, 28, 27, 39, 31, 28, 41, 33, 30, 57, 48, 53, 17, 4, 0, 242,
				225, 77, 240, 216, 20, 245, 214, 28, 249, 217, 34, 246, 216, 32, 245, 217, 32, 246, 216, 32, 246, 216, 30, 246, 217, 25, 246, 217, 27,
				245, 214, 35, 245, 214, 35, 246, 215, 28, 255, 206, 59, 189, 79, 20, 196, 64, 49, 188, 60, 47, 189, 61, 48, 195, 56, 51, 197, 55, 51,
				192, 55, 49, 192, 57, 51, 191, 54, 48, 194, 57, 51, 191, 56, 50, 194, 57, 51, 203, 58, 53, 165, 55, 38, 9, 3, 0, 43, 39, 36, 38, 34,
				31, 35, 30, 26, 41, 26, 23, 42, 26, 26, 35, 30, 27, 33, 29, 28, 36, 27, 28, 38, 28, 27, 39, 31, 28, 41, 33, 30, 57, 48, 53, 17, 4, 0,
				242, 225, 77, 240, 216, 20, 245, 214, 28, 249, 217, 34, 246, 216, 32, 245, 217, 32, 246, 216, 32, 246, 216, 30, 246, 217, 25, 246,
				217, 27, 245, 214, 35, 245, 214, 35, 246, 215, 28, 255, 206, 59, 189, 79, 20, 196, 64, 49, 188, 60, 47, 189, 61, 48, 195, 56, 51, 197,
				55, 51, 193, 56, 50, 192, 57, 51, 191, 54, 48, 194, 57, 51, 191, 56, 50, 194, 57, 51, 203, 58, 53, 166, 56, 39, 8, 2, 0, 45, 41, 38,
				38, 34, 31, 35, 30, 26, 41, 26, 23, 42, 26, 26, 35, 30, 27, 33, 29, 28, 36, 27, 28, 38, 28, 27, 39, 31, 28, 41, 33, 30, 57, 48, 53,
				17, 4, 0, 242, 225, 77, 240, 216, 20, 245, 214, 28, 249, 217, 34, 246, 216, 32, 245, 217, 32, 246, 216, 32, 246, 216, 30, 246, 217,
				25, 246, 217, 27, 245, 214, 35, 245, 214, 35, 246, 215, 28, 255, 206, 59, 189, 79, 20, 196, 64, 49, 188, 60, 47, 189, 61, 48, 195, 56,
				51, 197, 55, 51, 194, 57, 51, 194, 59, 53, 192, 55, 49, 194, 57, 51, 190, 55, 49, 193, 56, 50, 202, 57, 52, 165, 55, 38, 6, 0, 0, 41,
				37, 34, 38, 34, 31, 35, 30, 26, 41, 26, 23, 42, 26, 26, 35, 30, 27, 33, 29, 28, 36, 27, 28, 38, 28, 27, 39, 31, 28, 41, 33, 30, 57,
				48, 53, 17, 4, 0, 242, 225, 77, 240, 216, 20, 245, 214, 28, 249, 217, 34, 246, 216, 32, 245, 217, 32, 246, 216, 32, 246, 216, 30, 246,
				217, 25, 246, 217, 27, 245, 214, 35, 245, 214, 35, 246, 215, 28, 255, 206, 59, 189, 79, 20, 196, 64, 49, 188, 60, 47, 189, 61, 48,
				195, 56, 51, 197, 55, 51, 195, 58, 52, 194, 59, 53, 192, 55, 49, 195, 58, 52, 191, 56, 50, 193, 56, 50, 201, 56, 51, 163, 53, 36, 9,
				3, 0, 45, 41, 38, 38, 34, 31, 35, 30, 26, 41, 26, 23, 42, 26, 26, 35, 30, 27, 33, 29, 28, 36, 27, 28, 38, 28, 27, 39, 31, 28, 41, 33,
				30, 57, 48, 53, 17, 4, 0, 242, 225, 77, 240, 216, 20, 245, 214, 28, 249, 217, 34, 246, 216, 32, 245, 217, 32, 246, 216, 32, 246, 216,
				30, 246, 217, 25, 246, 217, 27, 245, 214, 35, 245, 214, 35, 246, 215, 28, 255, 206, 59, 189, 79, 20, 196, 64, 49, 188, 60, 47, 189,
				61, 48, 195, 56, 51, 197, 55, 51, 193, 56, 50, 194, 59, 53, 193, 56, 50, 196, 59, 53, 192, 57, 51, 193, 56, 50, 200, 55, 52, 162, 52,
				37, 7, 1, 0, 41, 37, 34, 38, 34, 31, 35, 30, 26, 41, 26, 23, 42, 26, 26, 35, 30, 27, 33, 29, 28, 36, 27, 28, 38, 28, 27, 39, 31, 28,
				41, 33, 30, 57, 48, 53, 17, 4, 0, 242, 225, 77, 240, 216, 20, 245, 214, 28, 249, 217, 34, 246, 216, 32, 245, 217, 32, 246, 216, 32,
				246, 216, 30, 246, 217, 25, 246, 217, 27, 245, 214, 35, 245, 214, 35, 246, 215, 28, 255, 206, 59, 189, 79, 20, 196, 64, 49, 188, 60,
				47, 189, 61, 48, 195, 56, 51, 197, 55, 51, 192, 55, 49, 193, 58, 52, 192, 55, 49, 196, 59, 53, 192, 57, 51, 194, 57, 51, 201, 56, 53,
				162, 52, 37, 7, 1, 0, 43, 39, 36, 37, 33, 30, 36, 31, 27, 42, 27, 24, 42, 26, 26, 36, 31, 28, 35, 31, 30, 38, 29, 30, 38, 28, 27, 38,
				30, 27, 42, 34, 31, 57, 48, 53, 15, 2, 0, 240, 223, 75, 240, 216, 20, 246, 215, 29, 248, 216, 33, 246, 216, 32, 245, 217, 32, 246,
				216, 32, 246, 216, 30, 246, 217, 25, 246, 217, 27, 245, 214, 35, 245, 214, 35, 244, 213, 26, 255, 204, 57, 188, 78, 19, 195, 63, 48,
				188, 60, 47, 190, 62, 49, 196, 57, 52, 199, 57, 53, 193, 56, 50, 193, 58, 52, 193, 56, 50, 196, 59, 53, 192, 57, 51, 195, 58, 52, 202,
				57, 54, 164, 54, 39, 7, 1, 0, 43, 39, 36, 34, 30, 27, 34, 29, 25, 40, 25, 22, 39, 23, 23, 33, 28, 25, 33, 29, 28, 35, 26, 27, 36, 26,
				25, 40, 32, 29, 44, 36, 33, 59, 50, 55, 17, 4, 0, 240, 223, 75, 239, 215, 19, 244, 213, 27, 246, 214, 31, 246, 216, 32, 246, 218, 33,
				247, 217, 33, 247, 217, 31, 247, 218, 26, 246, 217, 27, 246, 215, 36, 245, 214, 35, 245, 214, 27, 255, 205, 58, 189, 79, 20, 195, 63,
				48, 187, 59, 46, 188, 60, 47, 194, 55, 50, 196, 54, 50, 194, 57, 51, 194, 59, 53, 194, 57, 51, 197, 60, 54, 193, 58, 52, 196, 59, 53,
				203, 58, 55, 165, 55, 40, 7, 1, 0, 44, 40, 37, 38, 34, 31, 38, 33, 29, 44, 29, 26, 44, 28, 28, 38, 33, 30, 37, 33, 32, 40, 31, 32, 40,
				30, 29, 36, 28, 25, 41, 33, 30, 57, 48, 53, 17, 4, 0, 242, 225, 77, 242, 218, 22, 247, 216, 30, 249, 217, 34, 246, 216, 32, 245, 217,
				32, 247, 217, 33, 247, 217, 31, 247, 218, 26, 246, 217, 27, 246, 215, 36, 245, 214, 35, 245, 214, 27, 255, 205, 58, 189, 79, 20, 195,
				63, 48, 187, 59, 46, 188, 60, 47, 194, 55, 50, 197, 55, 51, 193, 56, 48, 193, 59, 50, 192, 55, 49, 195, 58, 52, 192, 57, 51, 194, 57,
				51, 202, 57, 54, 164, 54, 39, 7, 1, 0, 46, 42, 39, 36, 32, 29, 35, 30, 26, 41, 26, 23, 41, 25, 25, 35, 30, 27, 34, 30, 29, 37, 28, 29,
				37, 27, 26, 35, 27, 24, 40, 32, 29, 57, 48, 53, 17, 4, 0, 242, 225, 77, 242, 218, 22, 247, 216, 30, 248, 216, 33, 245, 215, 31, 245,
				217, 32, 246, 216, 32, 246, 216, 30, 246, 217, 25, 245, 216, 26, 245, 214, 35, 244, 213, 34, 245, 214, 27, 255, 205, 58, 189, 79, 20,
				196, 64, 49, 188, 60, 47, 190, 62, 49, 196, 57, 52, 199, 57, 53, 194, 57, 49, 193, 59, 50, 192, 55, 49, 195, 58, 52, 192, 57, 51, 194,
				57, 51, 202, 57, 54, 165, 55, 40, 7, 1, 0, 43, 39, 36, 36, 32, 29, 36, 31, 27, 42, 27, 24, 42, 26, 26, 36, 31, 28, 35, 31, 30, 38, 29,
				30, 38, 28, 27, 38, 30, 27, 43, 35, 32, 58, 49, 54, 16, 3, 0, 240, 223, 75, 239, 215, 19, 244, 213, 27, 245, 213, 30, 246, 216, 32,
				245, 217, 32, 246, 216, 32, 246, 216, 30, 246, 217, 25, 246, 217, 27, 245, 214, 35, 245, 214, 35, 245, 214, 27, 255, 205, 58, 189, 79,
				20, 195, 63, 48, 188, 60, 47, 189, 61, 48, 195, 56, 51, 197, 55, 51, 195, 58, 50, 195, 61, 52, 194, 57, 49, 196, 59, 51, 193, 58, 52,
				196, 59, 53, 204, 59, 56, 166, 56, 41, 7, 1, 0, 40, 36, 33, 38, 34, 31, 38, 33, 29, 43, 28, 25, 43, 27, 27, 37, 32, 29, 36, 32, 31,
				39, 30, 31, 39, 29, 28, 36, 28, 25, 41, 33, 30, 56, 47, 52, 15, 2, 0, 240, 223, 75, 241, 217, 21, 247, 216, 30, 249, 217, 34, 247,
				217, 33, 246, 218, 33, 247, 217, 33, 247, 217, 31, 247, 218, 26, 247, 218, 28, 246, 215, 36, 246, 215, 36, 247, 216, 29, 255, 206, 59,
				189, 79, 20, 195, 63, 48, 186, 58, 45, 186, 58, 45, 192, 53, 48, 194, 52, 48, 194, 57, 49, 194, 60, 51, 192, 55, 47, 194, 57, 49, 191,
				56, 50, 194, 57, 51, 202, 57, 54, 165, 55, 40, 9, 3, 0, 42, 38, 35, 36, 32, 29, 35, 30, 26, 41, 26, 23, 41, 25, 25, 35, 30, 27, 34,
				30, 29, 37, 28, 29, 37, 27, 26, 38, 30, 27, 42, 34, 31, 57, 48, 53, 15, 2, 0, 240, 223, 75, 242, 218, 22, 249, 218, 32, 252, 220, 37,
				246, 216, 32, 245, 217, 32, 246, 216, 32, 246, 216, 30, 246, 217, 25, 245, 216, 26, 245, 214, 35, 245, 214, 35, 246, 215, 28, 255,
				206, 59, 190, 80, 21, 196, 64, 49, 188, 60, 47, 188, 60, 47, 194, 55, 50, 197, 55, 51, 194, 57, 49, 194, 60, 51, 191, 54, 46, 194, 57,
				49, 190, 55, 49, 193, 56, 50, 202, 57, 54, 165, 55, 40, 11, 7, 0, 50, 44, 28, 48, 45, 28, 50, 43, 25, 53, 40, 24, 53, 40, 24, 49, 42,
				26, 49, 43, 29, 49, 41, 28, 50, 41, 26, 50, 43, 25, 52, 45, 29, 64, 56, 45, 17, 4, 0, 235, 220, 95, 231, 211, 52, 235, 210, 56, 238,
				211, 60, 235, 211, 59, 235, 211, 59, 236, 212, 60, 236, 213, 58, 235, 212, 54, 235, 212, 56, 234, 210, 60, 234, 210, 60, 237, 212, 58,
				250, 206, 81, 170, 88, 30, 177, 77, 53, 170, 74, 49, 174, 75, 52, 178, 73, 54, 180, 73, 55, 176, 73, 54, 176, 75, 55, 173, 70, 51,
				175, 72, 53, 173, 72, 54, 175, 72, 55, 184, 74, 59, 153, 69, 45,
			]
		),
	},
	{
		c: "br",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				103, 134, 64, 98, 142, 67, 97, 148, 73, 96, 147, 72, 98, 146, 70, 101, 145, 68, 101, 145, 66, 101, 145, 66, 101, 145, 68, 99, 147, 73,
				93, 144, 75, 89, 142, 74, 92, 148, 83, 92, 149, 81, 83, 140, 71, 89, 145, 74, 96, 152, 79, 91, 147, 72, 91, 149, 72, 85, 144, 64, 93,
				150, 69, 98, 152, 68, 92, 142, 55, 102, 146, 59, 111, 151, 65, 102, 137, 53, 107, 140, 59, 104, 137, 58, 105, 137, 62, 110, 141, 71,
				109, 141, 76, 103, 137, 76, 103, 136, 79, 107, 143, 82, 102, 142, 72, 105, 143, 70, 108, 139, 69, 106, 139, 68, 102, 142, 69, 102,
				144, 68, 102, 143, 67, 109, 135, 62, 95, 139, 64, 88, 147, 67, 86, 150, 66, 85, 151, 64, 85, 149, 62, 86, 149, 60, 86, 149, 58, 86,
				149, 60, 86, 150, 64, 83, 151, 68, 83, 154, 76, 73, 145, 71, 73, 147, 72, 80, 154, 77, 82, 155, 74, 81, 153, 69, 81, 151, 63, 78, 147,
				56, 81, 146, 54, 92, 156, 60, 88, 150, 49, 84, 147, 42, 93, 154, 50, 88, 146, 44, 82, 137, 43, 93, 148, 57, 99, 152, 64, 98, 150, 65,
				93, 145, 60, 88, 140, 57, 92, 143, 64, 98, 149, 74, 96, 145, 79, 87, 138, 71, 91, 145, 67, 94, 147, 65, 99, 143, 64, 98, 142, 63, 92,
				147, 63, 91, 149, 64, 94, 146, 63, 101, 138, 60, 89, 142, 64, 82, 150, 65, 85, 149, 62, 88, 148, 58, 87, 148, 55, 87, 148, 53, 87,
				148, 53, 87, 148, 55, 85, 150, 60, 84, 149, 65, 76, 145, 64, 81, 152, 74, 83, 151, 74, 78, 147, 66, 82, 148, 60, 86, 150, 54, 87, 150,
				46, 94, 146, 45, 112, 147, 53, 104, 134, 38, 119, 157, 46, 123, 168, 51, 94, 147, 33, 91, 148, 45, 98, 160, 75, 84, 148, 74, 76, 144,
				71, 79, 150, 70, 87, 158, 62, 88, 161, 56, 85, 153, 50, 81, 147, 49, 83, 145, 62, 86, 149, 70, 83, 149, 62, 85, 149, 62, 92, 146, 60,
				90, 146, 59, 83, 149, 59, 83, 152, 61, 86, 149, 60, 96, 139, 57, 86, 143, 64, 79, 152, 63, 86, 150, 63, 89, 148, 58, 89, 148, 54, 89,
				149, 53, 89, 149, 53, 88, 149, 54, 85, 150, 60, 85, 151, 64, 87, 155, 72, 84, 152, 69, 78, 142, 58, 83, 143, 53, 98, 156, 56, 98, 151,
				43, 94, 143, 26, 109, 144, 24, 131, 140, 23, 180, 182, 57, 207, 222, 81, 193, 218, 72, 148, 185, 45, 104, 153, 28, 85, 141, 44, 84,
				148, 64, 85, 156, 76, 80, 156, 68, 74, 153, 46, 71, 152, 34, 76, 154, 35, 82, 155, 47, 86, 155, 66, 87, 155, 72, 78, 151, 61, 82, 151,
				60, 88, 147, 57, 86, 146, 56, 80, 151, 57, 79, 154, 59, 81, 150, 57, 92, 140, 54, 86, 143, 62, 78, 152, 63, 86, 150, 63, 89, 149, 61,
				89, 150, 57, 88, 149, 54, 88, 150, 53, 87, 151, 55, 86, 151, 59, 85, 151, 63, 87, 153, 66, 84, 146, 60, 87, 146, 54, 102, 154, 54,
				106, 153, 41, 95, 135, 12, 112, 146, 10, 163, 181, 33, 220, 208, 44, 242, 223, 43, 242, 235, 43, 229, 235, 41, 215, 233, 49, 189, 217,
				54, 140, 180, 45, 98, 149, 31, 84, 143, 37, 91, 159, 50, 91, 164, 46, 80, 156, 32, 77, 152, 33, 85, 156, 50, 87, 153, 66, 78, 145, 65,
				78, 151, 62, 82, 151, 60, 91, 147, 60, 88, 146, 59, 78, 152, 57, 78, 155, 59, 79, 152, 60, 92, 142, 57, 88, 143, 59, 79, 153, 64, 85,
				149, 63, 88, 148, 62, 88, 148, 58, 85, 149, 53, 85, 149, 53, 85, 151, 54, 85, 150, 58, 85, 150, 60, 80, 142, 56, 92, 151, 61, 99, 151,
				53, 98, 141, 33, 105, 139, 16, 130, 156, 20, 174, 194, 43, 220, 228, 67, 236, 225, 55, 233, 217, 43, 243, 232, 54, 237, 234, 57, 214,
				216, 45, 213, 223, 62, 204, 224, 73, 161, 190, 48, 117, 154, 22, 100, 146, 21, 94, 148, 28, 97, 157, 44, 92, 158, 52, 80, 147, 50, 74,
				144, 56, 80, 149, 66, 79, 152, 62, 85, 151, 61, 92, 146, 60, 90, 146, 59, 79, 152, 60, 79, 156, 62, 79, 152, 60, 92, 141, 59, 90, 142,
				57, 82, 152, 63, 85, 149, 65, 86, 148, 63, 85, 148, 59, 85, 148, 57, 85, 149, 55, 84, 149, 55, 85, 150, 58, 86, 149, 60, 94, 152, 65,
				96, 149, 57, 100, 142, 42, 112, 145, 32, 153, 174, 43, 207, 219, 71, 231, 236, 74, 218, 222, 65, 215, 226, 95, 217, 229, 117, 210,
				214, 119, 216, 213, 120, 239, 231, 130, 241, 232, 113, 226, 220, 74, 224, 221, 64, 213, 218, 63, 156, 169, 29, 106, 130, 20, 96, 132,
				44, 99, 147, 71, 88, 150, 73, 78, 152, 63, 82, 159, 65, 81, 151, 62, 87, 149, 63, 95, 144, 62, 92, 144, 61, 82, 151, 62, 78, 154, 63,
				79, 152, 62, 92, 141, 59, 93, 141, 55, 85, 151, 61, 87, 149, 64, 87, 149, 64, 85, 150, 60, 84, 151, 56, 85, 151, 53, 86, 151, 51, 87,
				152, 52, 92, 149, 52, 99, 145, 47, 104, 140, 34, 141, 166, 46, 190, 206, 74, 219, 222, 83, 223, 226, 87, 209, 226, 98, 186, 217, 113,
				148, 195, 127, 116, 167, 124, 114, 157, 129, 125, 157, 133, 135, 154, 122, 161, 175, 116, 197, 212, 109, 221, 229, 94, 229, 223, 67,
				229, 222, 71, 196, 197, 77, 140, 155, 54, 106, 134, 47, 99, 144, 59, 89, 154, 62, 77, 148, 54, 81, 150, 59, 86, 148, 62, 93, 145, 62,
				90, 144, 58, 81, 150, 59, 80, 153, 61, 81, 152, 60, 92, 142, 57, 94, 140, 52, 87, 151, 57, 96, 151, 67, 85, 145, 59, 78, 149, 55, 82,
				159, 57, 88, 157, 50, 85, 149, 37, 87, 147, 33, 101, 148, 32, 128, 151, 35, 186, 193, 63, 205, 206, 50, 239, 231, 70, 240, 216, 68,
				222, 220, 111, 147, 201, 152, 72, 159, 153, 41, 136, 154, 37, 138, 166, 28, 134, 160, 29, 128, 157, 47, 131, 168, 51, 129, 149, 93,
				172, 151, 147, 200, 128, 226, 229, 98, 232, 214, 54, 236, 226, 69, 219, 218, 68, 172, 176, 39, 133, 151, 31, 100, 140, 41, 93, 147,
				59, 88, 148, 60, 85, 150, 60, 87, 150, 61, 83, 148, 56, 76, 146, 50, 81, 152, 56, 86, 156, 60, 94, 144, 55, 95, 139, 52, 87, 151, 57,
				85, 148, 59, 84, 148, 62, 79, 152, 63, 80, 152, 53, 84, 147, 33, 95, 147, 23, 119, 158, 31, 149, 171, 36, 195, 197, 52, 230, 222, 61,
				243, 237, 51, 232, 222, 47, 242, 222, 91, 177, 183, 109, 50, 120, 112, 35, 138, 171, 35, 143, 190, 33, 147, 199, 37, 159, 206, 28,
				149, 202, 43, 156, 224, 35, 145, 204, 16, 129, 159, 73, 158, 135, 175, 200, 109, 240, 233, 93, 238, 225, 59, 242, 227, 50, 229, 215,
				44, 193, 193, 37, 140, 162, 36, 97, 136, 29, 101, 149, 50, 87, 142, 48, 88, 147, 53, 94, 155, 62, 90, 154, 60, 85, 152, 59, 84, 150,
				60, 93, 143, 58, 95, 140, 55, 83, 153, 57, 83, 163, 68, 75, 154, 65, 81, 147, 75, 95, 150, 69, 104, 151, 37, 130, 156, 23, 184, 181,
				42, 232, 216, 59, 240, 225, 44, 246, 238, 39, 214, 218, 10, 234, 243, 72, 196, 209, 121, 123, 152, 121, 120, 180, 178, 89, 168, 183,
				83, 168, 188, 91, 181, 207, 44, 138, 174, 50, 148, 195, 53, 156, 215, 35, 144, 203, 44, 160, 209, 40, 140, 156, 78, 136, 98, 193, 217,
				123, 222, 216, 68, 243, 221, 39, 255, 233, 40, 244, 231, 41, 209, 226, 52, 174, 204, 54, 123, 154, 34, 106, 141, 39, 98, 138, 41, 96,
				143, 51, 94, 146, 61, 93, 152, 70, 87, 150, 71, 86, 133, 61, 96, 141, 58, 83, 153, 57, 70, 148, 47, 84, 156, 57, 99, 150, 58, 116,
				149, 45, 152, 174, 37, 206, 211, 56, 245, 225, 68, 251, 221, 47, 247, 224, 24, 238, 227, 13, 239, 246, 29, 207, 232, 68, 210, 247,
				193, 144, 195, 198, 133, 200, 209, 108, 184, 198, 99, 175, 191, 140, 214, 239, 138, 212, 249, 116, 197, 240, 87, 183, 225, 63, 166,
				207, 39, 146, 188, 38, 137, 166, 64, 142, 146, 147, 194, 140, 231, 236, 92, 243, 223, 30, 248, 220, 14, 239, 219, 11, 229, 231, 34,
				211, 226, 49, 198, 212, 65, 149, 165, 40, 117, 142, 25, 113, 149, 43, 105, 148, 56, 86, 139, 57, 84, 145, 68, 104, 151, 83, 95, 142,
				61, 86, 150, 56, 93, 151, 49, 93, 138, 21, 131, 154, 14, 196, 201, 37, 239, 231, 45, 239, 226, 34, 232, 220, 36, 245, 227, 41, 255,
				234, 33, 246, 229, 19, 225, 234, 21, 203, 236, 83, 159, 212, 182, 156, 227, 255, 119, 206, 234, 100, 189, 223, 96, 173, 215, 131, 199,
				246, 133, 199, 247, 126, 198, 236, 129, 218, 236, 111, 204, 211, 90, 177, 184, 94, 177, 191, 66, 149, 179, 69, 131, 108, 211, 234, 84,
				236, 231, 18, 248, 227, 14, 253, 228, 21, 247, 233, 36, 238, 230, 43, 232, 227, 47, 225, 228, 59, 189, 202, 50, 132, 155, 21, 97, 134,
				21, 101, 151, 54, 98, 157, 73, 84, 134, 61, 95, 142, 64, 87, 148, 55, 94, 145, 42, 160, 195, 67, 219, 230, 64, 231, 227, 34, 238, 221,
				19, 253, 232, 29, 247, 233, 40, 235, 218, 24, 245, 220, 16, 243, 225, 17, 234, 240, 30, 188, 222, 76, 83, 146, 129, 93, 175, 222, 21,
				109, 155, 40, 128, 176, 85, 162, 216, 46, 117, 171, 44, 112, 161, 85, 161, 197, 101, 193, 208, 97, 188, 193, 132, 206, 215, 102, 170,
				189, 104, 180, 214, 68, 127, 105, 216, 235, 83, 242, 235, 22, 251, 228, 24, 251, 225, 26, 244, 227, 26, 239, 226, 24, 243, 234, 31,
				231, 228, 35, 223, 231, 58, 203, 223, 72, 148, 183, 57, 95, 142, 38, 77, 137, 47, 95, 146, 69, 94, 142, 66, 83, 148, 56, 101, 158, 51,
				156, 197, 65, 215, 232, 64, 234, 235, 46, 230, 221, 30, 235, 218, 27, 248, 225, 35, 255, 232, 36, 254, 234, 26, 233, 221, 11, 239,
				241, 36, 186, 213, 74, 68, 135, 118, 50, 132, 182, 122, 192, 254, 68, 136, 199, 129, 207, 255, 51, 134, 176, 96, 177, 222, 72, 161,
				201, 45, 150, 182, 55, 153, 188, 102, 172, 223, 139, 196, 239, 138, 200, 215, 143, 185, 135, 232, 229, 76, 252, 225, 30, 254, 223, 45,
				244, 219, 39, 242, 234, 29, 244, 241, 24, 233, 230, 15, 232, 235, 32, 230, 241, 59, 203, 227, 69, 153, 188, 58, 110, 158, 49, 91, 150,
				56, 97, 146, 65, 94, 142, 68, 81, 147, 59, 83, 148, 44, 93, 145, 21, 138, 166, 19, 199, 211, 49, 234, 237, 72, 237, 229, 56, 242, 218,
				34, 246, 222, 26, 246, 229, 25, 246, 235, 31, 243, 231, 33, 202, 214, 78, 92, 151, 131, 135, 211, 255, 123, 188, 255, 81, 151, 220,
				33, 125, 174, 67, 166, 207, 123, 212, 255, 90, 181, 228, 91, 192, 244, 38, 133, 189, 51, 122, 188, 113, 169, 218, 165, 218, 224, 222,
				252, 192, 240, 226, 75, 255, 221, 35, 255, 227, 61, 245, 219, 46, 237, 230, 26, 226, 231, 15, 229, 236, 34, 220, 232, 46, 190, 209,
				42, 137, 164, 21, 98, 136, 17, 95, 143, 43, 91, 149, 62, 86, 135, 56, 87, 137, 64, 83, 153, 67, 76, 150, 55, 89, 154, 52, 105, 146,
				40, 122, 149, 34, 163, 180, 52, 216, 220, 73, 245, 232, 57, 239, 222, 30, 248, 234, 39, 238, 220, 24, 249, 218, 29, 238, 226, 92, 121,
				160, 133, 105, 170, 210, 107, 181, 244, 69, 162, 231, 39, 160, 215, 32, 152, 202, 100, 194, 245, 97, 179, 237, 70, 153, 223, 48, 128,
				197, 33, 110, 166, 126, 191, 229, 160, 208, 220, 193, 215, 166, 228, 216, 70, 252, 223, 35, 255, 223, 50, 248, 223, 45, 240, 231, 32,
				226, 232, 36, 202, 219, 53, 153, 178, 35, 115, 146, 19, 104, 140, 32, 101, 144, 54, 98, 149, 70, 91, 149, 75, 93, 138, 69, 87, 137,
				66, 83, 152, 69, 87, 158, 64, 87, 152, 58, 94, 144, 57, 102, 141, 52, 116, 142, 45, 143, 161, 41, 190, 200, 43, 228, 233, 53, 223,
				223, 39, 242, 229, 39, 255, 222, 27, 247, 223, 73, 174, 194, 135, 63, 118, 121, 102, 183, 226, 63, 169, 229, 57, 186, 244, 24, 147,
				206, 67, 162, 218, 88, 167, 226, 81, 156, 224, 97, 171, 232, 112, 190, 228, 148, 212, 222, 131, 166, 146, 202, 213, 137, 229, 215, 57,
				249, 224, 35, 255, 233, 57, 236, 219, 51, 222, 222, 50, 197, 213, 52, 132, 163, 33, 109, 149, 37, 101, 143, 43, 101, 147, 57, 98, 147,
				68, 92, 145, 73, 86, 146, 76, 93, 135, 69, 89, 136, 66, 86, 152, 65, 91, 151, 53, 88, 144, 43, 93, 147, 53, 107, 152, 69, 108, 142,
				68, 102, 135, 46, 112, 158, 26, 143, 184, 26, 206, 228, 58, 227, 226, 40, 255, 231, 25, 239, 215, 31, 224, 228, 108, 134, 175, 117,
				28, 116, 118, 46, 159, 199, 44, 158, 220, 46, 153, 221, 37, 127, 189, 59, 140, 195, 114, 190, 239, 145, 220, 252, 137, 210, 219, 124,
				178, 146, 164, 179, 88, 245, 236, 95, 238, 220, 36, 238, 220, 24, 240, 232, 59, 200, 204, 55, 158, 178, 53, 102, 138, 28, 95, 143, 41,
				87, 143, 46, 90, 146, 55, 89, 149, 63, 85, 144, 64, 84, 145, 68, 86, 148, 71, 96, 139, 67, 89, 136, 66, 87, 151, 67, 97, 153, 62, 93,
				149, 52, 87, 147, 49, 90, 146, 57, 95, 142, 72, 92, 143, 64, 86, 151, 33, 91, 153, 10, 118, 158, 9, 196, 215, 48, 208, 204, 17, 253,
				243, 60, 216, 215, 63, 191, 217, 107, 135, 205, 145, 45, 136, 121, 42, 132, 156, 58, 143, 184, 76, 154, 193, 83, 154, 184, 64, 130,
				146, 85, 145, 137, 136, 191, 152, 149, 184, 104, 217, 217, 85, 246, 232, 65, 226, 217, 34, 220, 224, 43, 189, 205, 47, 121, 148, 19,
				98, 134, 36, 96, 144, 58, 96, 155, 65, 87, 152, 60, 84, 151, 58, 81, 147, 57, 80, 146, 58, 87, 153, 65, 89, 153, 66, 93, 138, 57, 89,
				136, 64, 87, 151, 73, 84, 146, 73, 87, 150, 69, 85, 153, 52, 76, 149, 44, 74, 147, 58, 82, 153, 61, 91, 158, 42, 95, 158, 28, 96, 157,
				27, 86, 136, 3, 146, 174, 38, 200, 213, 71, 219, 229, 70, 219, 233, 76, 201, 228, 87, 165, 204, 97, 128, 181, 127, 87, 146, 124, 93,
				150, 141, 115, 167, 154, 120, 159, 130, 144, 174, 114, 190, 213, 107, 218, 228, 95, 231, 223, 80, 229, 223, 73, 194, 214, 57, 133,
				171, 23, 96, 143, 15, 103, 152, 43, 107, 154, 62, 92, 144, 59, 87, 148, 55, 83, 151, 52, 83, 154, 52, 83, 154, 50, 83, 154, 48, 89,
				160, 56, 88, 156, 55, 86, 135, 44, 89, 136, 64, 85, 152, 73, 78, 144, 72, 82, 147, 67, 86, 154, 55, 88, 159, 55, 83, 157, 68, 80, 153,
				64, 84, 150, 50, 85, 151, 41, 83, 151, 40, 96, 160, 50, 102, 153, 50, 102, 139, 26, 180, 194, 57, 213, 219, 61, 219, 226, 58, 221,
				232, 76, 212, 230, 112, 197, 222, 130, 183, 216, 137, 176, 207, 129, 199, 218, 129, 215, 224, 117, 210, 214, 75, 225, 225, 79, 221,
				218, 85, 150, 162, 34, 115, 159, 24, 98, 159, 32, 85, 148, 41, 88, 149, 54, 85, 141, 54, 91, 146, 62, 83, 143, 57, 82, 147, 53, 87,
				155, 54, 84, 155, 49, 79, 151, 43, 82, 154, 46, 83, 154, 50, 91, 140, 49, 90, 136, 63, 87, 152, 68, 93, 159, 71, 88, 152, 58, 86, 145,
				51, 89, 145, 56, 90, 143, 71, 86, 143, 75, 79, 147, 74, 81, 150, 69, 85, 146, 51, 87, 149, 52, 79, 148, 57, 99, 153, 65, 116, 132, 43,
				149, 151, 42, 189, 201, 55, 221, 228, 63, 232, 217, 52, 232, 215, 49, 232, 234, 65, 218, 225, 59, 212, 214, 55, 236, 235, 85, 231,
				229, 94, 185, 190, 70, 130, 148, 48, 101, 139, 38, 89, 152, 35, 86, 156, 42, 83, 149, 52, 85, 147, 62, 87, 146, 64, 92, 150, 73, 94,
				147, 75, 89, 145, 70, 90, 150, 64, 85, 150, 56, 78, 146, 47, 78, 149, 47, 83, 153, 57, 94, 143, 62, 92, 135, 63, 89, 151, 66, 82, 146,
				52, 91, 153, 56, 95, 151, 60, 91, 143, 61, 91, 138, 68, 91, 143, 79, 85, 150, 84, 83, 151, 78, 91, 151, 65, 86, 146, 56, 82, 156, 69,
				83, 146, 65, 104, 131, 60, 120, 135, 50, 125, 151, 28, 161, 177, 26, 226, 214, 42, 248, 228, 45, 231, 228, 39, 226, 232, 44, 230, 237,
				61, 204, 211, 56, 159, 168, 41, 122, 141, 36, 102, 141, 52, 101, 156, 65, 81, 149, 46, 77, 150, 45, 88, 154, 64, 87, 149, 66, 87, 151,
				67, 84, 145, 67, 91, 147, 74, 83, 141, 67, 83, 145, 62, 86, 152, 62, 85, 155, 59, 85, 155, 59, 83, 152, 61, 89, 138, 59, 87, 129, 57,
				93, 146, 66, 90, 148, 63, 89, 149, 59, 90, 148, 61, 90, 148, 63, 91, 146, 65, 89, 146, 67, 86, 147, 69, 85, 148, 67, 87, 147, 61, 87,
				147, 59, 84, 150, 62, 86, 148, 62, 93, 145, 62, 98, 144, 56, 96, 147, 46, 103, 146, 30, 136, 158, 23, 180, 195, 50, 210, 234, 88, 203,
				232, 88, 162, 194, 57, 121, 156, 28, 103, 142, 27, 100, 145, 40, 94, 148, 50, 90, 150, 54, 85, 151, 53, 84, 152, 53, 85, 150, 56, 85,
				150, 60, 85, 150, 60, 85, 150, 60, 84, 150, 62, 81, 151, 62, 78, 151, 59, 74, 151, 55, 77, 154, 58, 82, 155, 63, 85, 149, 62, 91, 138,
				60, 95, 132, 62, 100, 148, 72, 89, 147, 62, 86, 149, 60, 86, 149, 60, 86, 149, 60, 86, 149, 60, 86, 149, 60, 85, 148, 59, 85, 148, 59,
				85, 148, 59, 85, 148, 59, 84, 149, 59, 84, 149, 57, 85, 150, 58, 85, 150, 58, 85, 150, 58, 91, 149, 49, 99, 143, 30, 114, 153, 34,
				124, 164, 49, 119, 163, 50, 103, 153, 42, 91, 144, 38, 88, 145, 42, 90, 150, 52, 84, 148, 52, 83, 148, 54, 82, 149, 56, 82, 149, 56,
				82, 148, 58, 84, 149, 59, 84, 149, 59, 85, 150, 58, 83, 148, 56, 83, 150, 55, 80, 151, 55, 77, 151, 56, 79, 152, 60, 86, 152, 62, 90,
				145, 62, 94, 135, 57, 98, 129, 61, 96, 143, 65, 89, 149, 61, 83, 152, 59, 83, 152, 59, 83, 152, 59, 83, 152, 59, 82, 151, 58, 82, 151,
				58, 82, 151, 58, 82, 151, 58, 83, 152, 59, 83, 152, 59, 83, 153, 57, 83, 153, 57, 83, 153, 57, 83, 153, 57, 87, 151, 54, 94, 149, 48,
				94, 145, 44, 91, 143, 43, 89, 145, 48, 92, 149, 55, 93, 154, 61, 90, 155, 65, 88, 154, 67, 82, 150, 65, 81, 151, 65, 81, 150, 67, 81,
				150, 67, 83, 151, 66, 86, 151, 67, 86, 151, 67, 91, 150, 66, 96, 146, 61, 97, 145, 59, 94, 147, 59, 94, 148, 60, 94, 150, 63, 98, 150,
				65, 101, 144, 65, 105, 135, 61, 109, 135, 72, 108, 143, 75, 98, 142, 67, 95, 144, 65, 95, 144, 65, 94, 143, 64, 94, 143, 64, 94, 143,
				62, 94, 143, 64, 94, 143, 62, 94, 143, 64, 94, 143, 62, 95, 144, 63, 95, 144, 63, 95, 144, 63, 95, 144, 62, 95, 144, 63, 96, 143, 62,
				101, 142, 63, 103, 142, 63, 102, 143, 65, 103, 145, 69, 102, 146, 71, 99, 145, 73, 94, 141, 71, 89, 139, 68, 92, 142, 73, 92, 142, 73,
				92, 142, 71, 94, 141, 71, 95, 141, 69, 97, 140, 68, 98, 141, 69, 102, 140, 67, 106, 136, 62, 107, 135, 60, 103, 135, 60, 100, 137, 60,
				102, 139, 62, 104, 138, 64, 107, 134, 65, 111, 130, 64,
			]
		),
	},
	{
		c: "cl",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				0, 82, 163, 7, 77, 147, 2, 86, 158, 3, 86, 156, 3, 83, 152, 8, 87, 154, 12, 89, 157, 14, 91, 159, 10, 89, 158, 2, 80, 152, 10, 93,
				173, 17, 89, 171, 48, 98, 183, 17, 35, 147, 248, 255, 253, 249, 239, 250, 255, 248, 251, 255, 243, 240, 253, 251, 252, 253, 251, 252,
				254, 252, 253, 254, 252, 253, 254, 252, 253, 254, 252, 253, 253, 251, 252, 253, 251, 252, 255, 251, 250, 255, 251, 250, 255, 251, 250,
				255, 251, 250, 255, 251, 250, 255, 252, 251, 255, 252, 251, 255, 252, 251, 255, 251, 250, 254, 250, 249, 254, 250, 249, 255, 251, 250,
				255, 251, 250, 254, 250, 249, 254, 250, 249, 255, 251, 250, 11, 96, 177, 18, 88, 158, 5, 89, 161, 8, 91, 161, 11, 91, 160, 6, 85, 152,
				10, 87, 155, 12, 89, 157, 5, 84, 153, 10, 88, 160, 2, 85, 165, 22, 94, 176, 41, 91, 176, 2, 20, 132, 248, 255, 253, 255, 251, 255,
				255, 250, 253, 255, 251, 248, 255, 253, 254, 255, 253, 254, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 253, 254,
				255, 253, 254, 255, 253, 252, 255, 253, 252, 255, 253, 252, 255, 253, 252, 255, 253, 252, 255, 253, 252, 255, 253, 252, 255, 253, 252,
				255, 254, 253, 255, 253, 252, 255, 253, 252, 255, 254, 253, 255, 254, 253, 255, 252, 251, 255, 252, 251, 255, 253, 252, 0, 96, 183, 0,
				86, 163, 0, 87, 163, 1, 88, 165, 10, 94, 167, 0, 82, 155, 10, 90, 163, 15, 95, 168, 0, 77, 152, 10, 92, 166, 1, 92, 149, 18, 96, 160,
				52, 105, 181, 8, 28, 149, 238, 255, 233, 240, 244, 253, 250, 253, 255, 249, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255,
				254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				254, 254, 255, 254, 254, 255, 255, 255, 255, 0, 94, 181, 2, 88, 165, 0, 90, 166, 0, 86, 163, 11, 95, 168, 10, 92, 165, 41, 121, 194,
				50, 130, 203, 12, 91, 166, 12, 94, 168, 5, 96, 153, 18, 96, 160, 41, 94, 170, 6, 26, 147, 242, 255, 237, 251, 255, 255, 250, 253, 255,
				249, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 253, 253, 255, 253, 253, 255, 254, 254, 255, 0, 91, 178, 0, 88, 176, 0,
				82, 171, 21, 87, 148, 14, 81, 136, 18, 68, 129, 164, 178, 191, 172, 198, 215, 12, 68, 143, 23, 79, 126, 11, 86, 143, 11, 88, 158, 44,
				100, 174, 1, 35, 142, 252, 255, 255, 253, 255, 242, 255, 253, 253, 247, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 254, 255, 255, 255, 255, 255, 255, 254,
				254, 254, 252, 252, 252, 255, 255, 255, 0, 92, 179, 0, 89, 177, 0, 90, 179, 44, 110, 171, 71, 138, 193, 82, 132, 193, 214, 228, 241,
				215, 241, 255, 77, 133, 208, 84, 140, 187, 43, 118, 175, 23, 100, 170, 40, 96, 170, 0, 31, 138, 251, 254, 255, 251, 253, 240, 255,
				252, 252, 248, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 254, 254, 254, 255, 255, 255, 255, 255, 255, 254, 254, 254, 252, 252, 252, 255, 255, 255, 15, 90, 155, 13,
				88, 145, 8, 91, 167, 27, 112, 177, 159, 208, 251, 224, 236, 250, 242, 247, 250, 254, 255, 255, 230, 242, 255, 174, 218, 255, 48, 113,
				181, 28, 96, 171, 45, 93, 167, 3, 28, 146, 255, 253, 255, 255, 252, 249, 255, 249, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255,
				254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255,
				254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 253, 255, 254, 254, 255, 255,
				254, 255, 255, 253, 255, 254, 251, 253, 252, 254, 255, 255, 15, 90, 155, 13, 88, 145, 4, 87, 163, 2, 87, 152, 88, 137, 180, 208, 220,
				234, 251, 255, 255, 254, 255, 255, 222, 234, 250, 97, 141, 180, 24, 89, 157, 21, 89, 164, 50, 98, 172, 4, 29, 147, 255, 253, 255, 255,
				254, 251, 255, 250, 255, 250, 251, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254,
				255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254,
				255, 255, 254, 255, 255, 254, 255, 255, 253, 255, 254, 254, 255, 255, 254, 255, 255, 253, 255, 254, 251, 253, 252, 254, 255, 255, 11,
				89, 172, 2, 87, 167, 12, 86, 161, 0, 85, 162, 32, 81, 140, 189, 205, 220, 234, 255, 255, 229, 238, 255, 211, 220, 225, 54, 97, 152,
				16, 87, 169, 16, 92, 170, 48, 102, 176, 0, 30, 159, 245, 255, 255, 251, 254, 255, 255, 252, 255, 249, 255, 255, 255, 254, 255, 255,
				254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255,
				254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 253, 254, 255,
				254, 255, 255, 254, 255, 255, 253, 254, 253, 251, 252, 255, 254, 255, 11, 89, 172, 2, 87, 167, 12, 86, 161, 11, 98, 175, 66, 115, 174,
				190, 206, 221, 141, 162, 189, 135, 144, 175, 198, 207, 212, 94, 137, 192, 23, 94, 176, 14, 90, 168, 43, 97, 171, 0, 31, 160, 248, 255,
				255, 249, 252, 255, 255, 251, 255, 249, 255, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254,
				255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254,
				255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 253, 254, 255, 254, 255, 255, 254, 255, 255, 253, 254, 253, 251, 252, 255, 254,
				255, 0, 98, 170, 8, 87, 156, 5, 85, 158, 14, 93, 172, 17, 98, 177, 46, 124, 186, 12, 79, 150, 5, 69, 141, 43, 116, 169, 27, 98, 178,
				21, 88, 166, 16, 87, 153, 47, 98, 153, 3, 34, 150, 249, 255, 244, 252, 254, 251, 255, 249, 253, 255, 255, 243, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 254, 255,
				255, 255, 255, 255, 255, 254, 254, 254, 252, 252, 252, 255, 255, 255, 0, 99, 171, 9, 88, 157, 8, 88, 161, 8, 87, 166, 4, 85, 164, 5,
				83, 145, 26, 93, 164, 34, 98, 170, 13, 86, 139, 13, 84, 164, 15, 82, 160, 21, 92, 158, 54, 105, 160, 0, 31, 147, 245, 255, 240, 252,
				254, 251, 255, 251, 255, 255, 255, 243, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 254, 255, 255, 255, 255, 255, 255, 254, 254, 254, 252, 252, 252, 255, 255, 255, 27,
				89, 166, 13, 80, 158, 19, 83, 145, 28, 78, 151, 12, 86, 151, 4, 88, 161, 18, 81, 158, 14, 84, 153, 2, 87, 167, 16, 82, 158, 15, 83,
				168, 21, 91, 163, 51, 100, 158, 0, 28, 135, 245, 255, 254, 252, 255, 255, 255, 250, 255, 255, 254, 248, 255, 255, 253, 255, 255, 253,
				255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253,
				255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 254, 252, 255, 255, 253, 255, 255, 253, 255, 254, 252,
				255, 255, 253, 254, 253, 251, 254, 253, 251, 255, 255, 253, 38, 100, 177, 28, 95, 173, 32, 96, 158, 41, 91, 164, 25, 99, 164, 17, 101,
				174, 31, 94, 171, 27, 97, 166, 15, 100, 180, 29, 95, 171, 21, 89, 174, 34, 104, 176, 57, 106, 164, 8, 41, 148, 248, 255, 255, 243,
				246, 251, 250, 237, 247, 255, 252, 246, 250, 249, 247, 250, 249, 247, 250, 249, 247, 250, 249, 247, 250, 249, 247, 250, 249, 247, 250,
				249, 247, 250, 249, 247, 250, 249, 247, 250, 249, 247, 250, 249, 247, 250, 249, 247, 250, 249, 247, 250, 249, 247, 250, 249, 247, 250,
				249, 247, 250, 249, 247, 251, 250, 248, 250, 249, 247, 250, 249, 247, 251, 250, 248, 249, 248, 246, 249, 248, 246, 254, 253, 251, 190,
				60, 62, 204, 53, 44, 189, 61, 60, 194, 56, 69, 196, 60, 46, 197, 58, 53, 200, 56, 56, 196, 60, 48, 190, 59, 67, 192, 59, 60, 203, 56,
				48, 196, 60, 48, 198, 57, 40, 182, 49, 78, 214, 77, 58, 209, 89, 72, 204, 79, 83, 200, 88, 87, 212, 81, 73, 212, 81, 73, 212, 81, 73,
				212, 81, 73, 212, 81, 73, 212, 81, 73, 212, 81, 73, 212, 81, 73, 212, 81, 73, 212, 81, 73, 212, 81, 73, 212, 81, 73, 212, 81, 73, 212,
				81, 73, 212, 81, 73, 212, 81, 73, 212, 81, 73, 214, 83, 75, 213, 82, 74, 212, 81, 73, 214, 83, 75, 212, 81, 73, 212, 81, 73, 217, 86,
				78, 191, 61, 63, 205, 54, 45, 188, 60, 59, 193, 55, 68, 195, 59, 45, 196, 57, 52, 199, 55, 55, 195, 59, 47, 189, 58, 66, 191, 58, 59,
				202, 55, 47, 196, 60, 48, 195, 54, 37, 192, 59, 88, 187, 50, 31, 177, 57, 40, 176, 51, 55, 171, 59, 58, 185, 54, 46, 185, 54, 46, 185,
				54, 46, 185, 54, 46, 185, 54, 46, 185, 54, 46, 185, 54, 46, 185, 54, 46, 185, 54, 46, 185, 54, 46, 185, 54, 46, 185, 54, 46, 185, 54,
				46, 185, 54, 46, 185, 54, 46, 185, 54, 46, 185, 54, 46, 186, 55, 47, 185, 54, 46, 185, 54, 46, 186, 55, 47, 184, 53, 45, 184, 53, 45,
				189, 58, 50, 199, 57, 56, 172, 64, 51, 188, 54, 61, 186, 55, 60, 195, 54, 47, 200, 51, 45, 193, 54, 49, 193, 54, 47, 197, 51, 52, 192,
				54, 52, 186, 58, 55, 187, 63, 61, 189, 55, 44, 177, 51, 55, 211, 68, 62, 191, 62, 31, 200, 58, 46, 196, 59, 49, 192, 58, 57, 192, 58,
				57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57,
				192, 58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 194, 60, 59, 192, 58, 57, 192, 58, 57, 194, 60, 59, 192, 58, 57, 192,
				58, 57, 197, 63, 62, 202, 60, 59, 172, 64, 51, 192, 58, 65, 190, 59, 64, 199, 58, 51, 204, 55, 49, 197, 58, 53, 197, 58, 51, 201, 55,
				56, 196, 58, 56, 185, 57, 54, 182, 58, 56, 191, 57, 46, 191, 65, 69, 189, 46, 40, 189, 60, 29, 201, 59, 47, 192, 55, 45, 192, 58, 57,
				192, 58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 192,
				58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 192, 58, 57, 191, 57, 56, 192, 58, 57, 191, 57, 56, 191, 57, 56, 193, 59, 58, 191, 57,
				56, 191, 57, 56, 196, 62, 61, 215, 57, 48, 194, 58, 42, 198, 54, 46, 196, 59, 27, 193, 55, 52, 189, 57, 52, 184, 61, 45, 186, 58, 57,
				193, 56, 46, 197, 56, 39, 201, 59, 47, 196, 57, 50, 203, 55, 41, 191, 57, 46, 203, 53, 62, 194, 65, 36, 199, 56, 52, 194, 55, 58, 194,
				56, 45, 194, 56, 45, 194, 56, 45, 194, 56, 45, 194, 56, 45, 194, 56, 45, 194, 56, 45, 194, 56, 45, 194, 56, 45, 194, 56, 45, 194, 56,
				45, 194, 56, 45, 194, 56, 45, 194, 56, 45, 194, 56, 45, 194, 56, 45, 193, 55, 44, 195, 57, 46, 194, 56, 45, 194, 56, 45, 195, 57, 46,
				193, 55, 44, 193, 55, 44, 198, 60, 49, 215, 57, 48, 193, 57, 41, 199, 55, 47, 197, 60, 28, 194, 56, 53, 190, 58, 53, 185, 62, 46, 187,
				59, 58, 194, 57, 47, 198, 57, 40, 197, 55, 43, 193, 54, 47, 203, 55, 41, 194, 60, 49, 197, 47, 56, 192, 63, 34, 194, 51, 47, 195, 56,
				59, 195, 57, 46, 195, 57, 46, 195, 57, 46, 195, 57, 46, 195, 57, 46, 195, 57, 46, 195, 57, 46, 195, 57, 46, 195, 57, 46, 195, 57, 46,
				195, 57, 46, 195, 57, 46, 195, 57, 46, 195, 57, 46, 195, 57, 46, 195, 57, 46, 194, 56, 45, 196, 58, 47, 195, 57, 46, 195, 57, 46, 196,
				58, 47, 194, 56, 45, 195, 57, 46, 200, 62, 51, 197, 61, 49, 198, 52, 52, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 56,
				51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47,
				195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195,
				57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 193, 56, 46, 196, 58, 48, 195, 57, 47, 194, 56,
				46, 196, 58, 48, 194, 56, 46, 196, 55, 46, 201, 60, 51, 199, 63, 51, 199, 53, 53, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51,
				195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195,
				57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57,
				47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 193, 56, 46, 196, 58, 48, 195, 57, 47,
				195, 57, 47, 196, 58, 48, 194, 56, 46, 196, 55, 46, 201, 60, 51, 200, 63, 47, 193, 56, 48, 191, 58, 49, 191, 58, 49, 191, 58, 49, 191,
				58, 49, 191, 58, 49, 191, 58, 49, 191, 58, 49, 191, 58, 49, 191, 59, 47, 191, 59, 47, 191, 59, 47, 191, 59, 47, 191, 59, 47, 191, 59,
				47, 191, 59, 47, 191, 59, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47,
				192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 191, 59, 47, 192, 60, 48, 191,
				59, 47, 192, 58, 47, 193, 59, 48, 191, 57, 46, 191, 57, 46, 198, 61, 51, 198, 61, 45, 191, 54, 46, 191, 58, 49, 191, 58, 49, 191, 58,
				49, 191, 58, 49, 191, 58, 49, 191, 58, 49, 191, 58, 49, 191, 58, 49, 191, 59, 47, 191, 59, 47, 191, 59, 47, 191, 59, 47, 191, 59, 47,
				191, 59, 47, 191, 59, 47, 191, 59, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192,
				58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 192, 58, 47, 191, 59, 47, 192, 60,
				48, 191, 59, 47, 192, 58, 47, 194, 60, 49, 192, 58, 47, 191, 57, 46, 198, 61, 51, 202, 58, 49, 195, 54, 47, 195, 56, 49, 195, 56, 49,
				195, 56, 49, 195, 56, 49, 195, 56, 49, 195, 56, 49, 195, 56, 49, 195, 56, 49, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195,
				56, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55,
				51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 195, 56, 51,
				196, 57, 52, 195, 56, 51, 195, 56, 51, 198, 56, 52, 196, 54, 50, 196, 54, 50, 201, 59, 55, 203, 59, 50, 196, 55, 48, 195, 56, 49, 195,
				56, 49, 195, 56, 49, 195, 56, 49, 195, 56, 49, 195, 56, 49, 195, 56, 49, 195, 56, 49, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 56,
				51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51,
				197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 197, 55, 51, 194,
				55, 50, 196, 57, 52, 195, 56, 51, 194, 55, 50, 198, 56, 52, 196, 54, 50, 196, 54, 50, 201, 59, 55, 195, 60, 64, 200, 50, 61, 193, 56,
				48, 193, 56, 48, 193, 56, 48, 193, 56, 48, 193, 56, 48, 193, 56, 48, 193, 56, 48, 193, 56, 48, 194, 57, 49, 194, 57, 49, 194, 57, 49,
				194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194,
				57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57,
				49, 191, 57, 48, 192, 58, 49, 193, 56, 48, 193, 56, 48, 194, 57, 49, 192, 55, 47, 193, 54, 47, 198, 59, 52, 194, 59, 63, 198, 48, 59,
				193, 56, 48, 193, 56, 48, 193, 56, 48, 193, 56, 48, 193, 56, 48, 193, 56, 48, 193, 56, 48, 193, 56, 48, 194, 57, 49, 194, 57, 49, 194,
				57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57,
				49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49,
				194, 57, 49, 190, 56, 47, 192, 58, 49, 193, 56, 48, 193, 56, 48, 194, 57, 49, 192, 55, 47, 193, 54, 47, 198, 59, 52,
			]
		),
	},
	{
		c: "ca",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				196, 58, 56, 203, 58, 61, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 222,
				194, 190, 255, 249, 255, 255, 251, 255, 255, 255, 248, 248, 255, 246, 241, 255, 251, 254, 255, 255, 255, 251, 253, 254, 255, 255, 244,
				255, 255, 255, 250, 255, 255, 250, 252, 248, 255, 255, 255, 254, 255, 251, 253, 250, 255, 255, 253, 254, 255, 255, 250, 255, 255, 255,
				253, 253, 252, 255, 250, 253, 254, 255, 237, 201, 201, 203, 62, 70, 202, 57, 60, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62,
				201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 199, 61, 59, 203, 58, 61, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201,
				58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 223, 195, 191, 255, 249, 255, 255, 252, 255, 255, 255, 248, 248, 255, 246, 245, 255,
				255, 254, 255, 255, 255, 250, 252, 254, 255, 255, 233, 249, 246, 255, 251, 255, 255, 253, 255, 244, 255, 251, 245, 243, 244, 254, 255,
				253, 253, 253, 251, 254, 255, 255, 250, 255, 255, 255, 253, 253, 252, 255, 250, 253, 254, 255, 237, 201, 201, 203, 62, 70, 202, 57,
				60, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 199, 61, 61, 201, 56, 61,
				201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 232, 192, 190, 255, 246, 255,
				247, 255, 255, 241, 255, 248, 255, 253, 250, 255, 254, 255, 245, 255, 255, 255, 251, 251, 255, 249, 254, 255, 254, 255, 255, 248, 251,
				255, 254, 251, 255, 255, 251, 255, 252, 253, 250, 255, 255, 255, 254, 255, 255, 251, 255, 255, 252, 255, 255, 252, 253, 254, 255, 250,
				253, 254, 255, 236, 202, 201, 198, 65, 70, 191, 63, 60, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62,
				201, 58, 62, 201, 58, 62, 198, 60, 60, 201, 56, 61, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201,
				58, 62, 201, 58, 62, 233, 193, 191, 255, 246, 255, 248, 255, 255, 241, 255, 248, 255, 253, 250, 255, 254, 255, 243, 254, 255, 255,
				253, 253, 255, 250, 255, 255, 254, 255, 255, 250, 253, 255, 252, 249, 252, 251, 247, 255, 252, 253, 251, 255, 255, 250, 249, 254, 255,
				251, 255, 255, 252, 255, 255, 252, 253, 254, 255, 250, 253, 254, 255, 236, 202, 201, 198, 65, 70, 191, 63, 60, 201, 58, 62, 201, 58,
				62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 199, 61, 61, 202, 57, 64, 201, 58, 62, 201, 58, 62,
				201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 223, 200, 192, 244, 255, 255, 245, 255, 255, 255, 251,
				255, 255, 253, 253, 255, 251, 255, 255, 251, 255, 247, 255, 251, 247, 255, 250, 252, 255, 246, 255, 202, 212, 236, 173, 181, 249, 255,
				244, 245, 255, 250, 255, 253, 255, 255, 249, 255, 249, 255, 255, 243, 255, 255, 251, 255, 253, 251, 255, 250, 255, 251, 255, 247, 196,
				201, 209, 59, 70, 202, 57, 60, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62,
				199, 61, 61, 202, 57, 64, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 219,
				196, 188, 244, 255, 255, 245, 255, 255, 255, 251, 255, 255, 253, 253, 255, 250, 255, 255, 251, 255, 238, 251, 242, 247, 255, 250, 245,
				251, 239, 216, 146, 156, 182, 119, 127, 237, 248, 232, 245, 255, 250, 250, 244, 248, 255, 249, 255, 249, 255, 255, 243, 255, 255, 251,
				255, 253, 251, 255, 250, 255, 251, 255, 247, 196, 201, 209, 59, 70, 202, 57, 60, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62,
				201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 198, 59, 62, 201, 56, 63, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201,
				58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 234, 184, 183, 255, 249, 255, 250, 250, 255, 255, 254, 255, 254, 255, 250, 253, 254,
				255, 255, 248, 255, 245, 200, 207, 255, 222, 224, 255, 217, 213, 197, 75, 88, 196, 64, 78, 255, 195, 198, 255, 226, 233, 238, 201,
				209, 253, 251, 254, 255, 253, 250, 250, 255, 255, 255, 255, 250, 252, 255, 248, 255, 252, 255, 241, 199, 201, 202, 63, 70, 192, 62,
				60, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 198, 59, 62, 203, 58, 65,
				201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 236, 186, 185, 255, 249, 255,
				251, 251, 255, 255, 254, 255, 254, 255, 250, 254, 255, 255, 255, 247, 255, 219, 174, 181, 166, 100, 102, 176, 118, 114, 188, 66, 79,
				189, 57, 71, 174, 89, 92, 172, 105, 112, 207, 170, 178, 253, 251, 254, 255, 253, 250, 250, 255, 255, 255, 255, 250, 252, 255, 248,
				255, 252, 255, 241, 199, 201, 202, 63, 70, 192, 62, 60, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62,
				201, 58, 62, 201, 58, 62, 198, 58, 61, 202, 57, 64, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201,
				58, 62, 201, 58, 62, 236, 192, 191, 255, 255, 253, 248, 255, 255, 255, 253, 247, 255, 254, 242, 251, 255, 248, 255, 251, 246, 229,
				200, 192, 201, 60, 76, 202, 54, 68, 202, 61, 67, 196, 62, 63, 216, 48, 65, 193, 58, 73, 228, 195, 188, 255, 253, 244, 255, 251, 238,
				255, 254, 248, 255, 253, 243, 254, 255, 243, 253, 254, 255, 237, 201, 201, 197, 60, 67, 198, 64, 63, 201, 58, 62, 201, 58, 62, 201,
				58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 199, 59, 62, 203, 58, 65, 201, 58, 62, 201, 58, 62, 201, 58,
				62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 234, 190, 189, 255, 255, 253, 242, 252, 253, 255, 254, 248, 255,
				255, 244, 212, 220, 209, 232, 223, 218, 248, 219, 211, 208, 67, 83, 204, 56, 70, 196, 55, 61, 191, 57, 58, 222, 54, 71, 200, 65, 80,
				240, 207, 200, 255, 248, 239, 226, 210, 197, 255, 254, 248, 253, 243, 233, 247, 249, 236, 254, 255, 255, 232, 196, 196, 205, 68, 75,
				191, 57, 56, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 199, 59, 60, 203,
				58, 65, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 232, 186, 188, 242,
				255, 253, 215, 193, 196, 255, 156, 170, 255, 169, 176, 239, 134, 148, 197, 89, 104, 255, 200, 194, 206, 86, 85, 204, 55, 61, 207, 57,
				59, 189, 62, 55, 200, 57, 59, 200, 80, 81, 255, 190, 181, 235, 139, 143, 215, 81, 92, 255, 148, 167, 240, 130, 143, 189, 124, 128,
				255, 237, 245, 246, 204, 205, 199, 62, 69, 200, 60, 63, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62,
				201, 58, 62, 201, 58, 62, 199, 59, 60, 202, 57, 64, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201,
				58, 62, 201, 58, 62, 238, 192, 194, 237, 255, 248, 237, 215, 218, 168, 66, 80, 168, 63, 70, 179, 74, 88, 167, 59, 74, 195, 122, 116,
				203, 83, 82, 205, 56, 62, 210, 60, 62, 192, 65, 58, 197, 54, 56, 195, 75, 76, 209, 141, 132, 163, 67, 71, 196, 62, 73, 182, 61, 80,
				178, 68, 81, 208, 143, 147, 255, 244, 252, 242, 200, 201, 194, 57, 64, 203, 63, 66, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58,
				62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 197, 57, 58, 201, 56, 61, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62,
				201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 228, 189, 192, 252, 255, 251, 239, 218, 213, 195, 89, 93, 214, 60, 68, 205, 50,
				64, 210, 59, 74, 209, 58, 67, 197, 62, 66, 197, 67, 67, 204, 55, 59, 196, 56, 55, 203, 63, 62, 204, 53, 60, 203, 60, 66, 212, 54, 68,
				192, 58, 55, 196, 69, 78, 185, 66, 72, 255, 196, 191, 255, 253, 250, 223, 206, 198, 191, 66, 70, 200, 57, 63, 201, 58, 62, 201, 58,
				62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 196, 56, 57, 202, 57, 62, 201, 58, 62, 201, 58, 62,
				201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 230, 191, 194, 249, 254, 248, 249, 228, 223, 199, 93,
				97, 205, 51, 59, 205, 50, 64, 207, 56, 71, 197, 46, 55, 192, 57, 61, 195, 65, 65, 203, 54, 58, 196, 56, 55, 201, 61, 60, 207, 56, 63,
				191, 48, 54, 217, 59, 73, 195, 61, 58, 181, 54, 63, 190, 71, 77, 242, 181, 176, 255, 249, 246, 228, 211, 203, 199, 74, 78, 196, 53,
				59, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 196, 56, 55, 204, 59, 64,
				201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 235, 185, 194, 254, 255, 251,
				172, 120, 122, 200, 59, 65, 199, 58, 51, 193, 61, 56, 208, 59, 63, 202, 67, 63, 203, 60, 66, 200, 57, 63, 202, 57, 64, 196, 62, 63,
				201, 52, 58, 213, 60, 65, 192, 67, 63, 191, 51, 52, 208, 59, 53, 209, 59, 68, 196, 55, 63, 173, 95, 91, 228, 214, 211, 227, 208, 201,
				194, 59, 66, 216, 54, 67, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 196,
				56, 55, 205, 60, 65, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 239, 189,
				198, 251, 253, 248, 255, 212, 214, 237, 96, 102, 199, 58, 51, 194, 62, 57, 206, 57, 61, 191, 56, 52, 202, 59, 65, 200, 57, 63, 199,
				54, 61, 196, 62, 63, 206, 57, 63, 203, 50, 55, 194, 69, 65, 200, 60, 61, 205, 56, 50, 204, 54, 63, 213, 72, 80, 255, 185, 181, 255,
				251, 248, 230, 211, 204, 194, 59, 66, 215, 53, 66, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201, 58, 62, 201,
				58, 62, 201, 58, 62, 203, 59, 58, 202, 59, 61, 202, 57, 64, 202, 57, 64, 202, 57, 64, 202, 57, 64, 202, 57, 64, 202, 57, 64, 202, 57,
				64, 202, 57, 64, 226, 194, 195, 254, 252, 253, 255, 248, 255, 241, 232, 233, 154, 114, 104, 186, 68, 66, 197, 53, 53, 201, 61, 60,
				205, 60, 73, 207, 51, 62, 194, 56, 56, 194, 62, 58, 208, 51, 60, 212, 56, 70, 198, 57, 66, 210, 55, 69, 190, 64, 75, 154, 90, 88, 238,
				208, 206, 255, 252, 255, 255, 251, 255, 234, 198, 198, 202, 66, 80, 193, 66, 60, 202, 57, 64, 202, 57, 64, 202, 57, 64, 202, 57, 64,
				202, 57, 64, 202, 57, 64, 202, 57, 64, 202, 57, 64, 202, 58, 57, 201, 58, 60, 202, 57, 64, 202, 57, 64, 202, 57, 64, 202, 57, 64, 202,
				57, 64, 202, 57, 64, 202, 57, 64, 202, 57, 64, 227, 195, 196, 254, 252, 253, 255, 250, 255, 255, 252, 253, 251, 211, 201, 215, 97, 95,
				202, 58, 58, 197, 57, 56, 198, 53, 66, 210, 54, 65, 201, 63, 63, 198, 66, 62, 207, 50, 59, 209, 53, 67, 195, 54, 63, 207, 52, 66, 201,
				75, 86, 255, 201, 199, 255, 246, 244, 255, 252, 255, 255, 253, 255, 241, 205, 205, 196, 60, 74, 188, 61, 55, 202, 57, 64, 202, 57, 64,
				202, 57, 64, 202, 57, 64, 202, 57, 64, 202, 57, 64, 202, 57, 64, 202, 57, 64, 194, 60, 69, 192, 61, 66, 196, 60, 60, 196, 60, 60, 196,
				60, 60, 196, 60, 60, 196, 60, 60, 196, 60, 60, 196, 60, 60, 196, 60, 60, 230, 193, 187, 255, 255, 247, 255, 253, 255, 255, 252, 253,
				255, 246, 239, 194, 102, 103, 182, 72, 75, 181, 70, 77, 160, 74, 75, 174, 80, 78, 182, 66, 67, 178, 59, 61, 172, 74, 73, 168, 80, 79,
				165, 73, 74, 164, 76, 75, 182, 82, 90, 255, 225, 219, 255, 249, 243, 245, 255, 255, 243, 255, 251, 233, 204, 198, 206, 60, 73, 209,
				54, 52, 198, 60, 60, 198, 60, 60, 198, 60, 60, 198, 60, 60, 198, 60, 60, 198, 60, 60, 198, 60, 60, 198, 60, 60, 194, 60, 69, 192, 61,
				66, 196, 60, 60, 196, 60, 60, 196, 60, 60, 196, 60, 60, 196, 60, 60, 196, 60, 60, 196, 60, 60, 196, 60, 60, 229, 192, 186, 255, 255,
				248, 255, 253, 255, 255, 248, 249, 255, 227, 220, 216, 124, 125, 233, 123, 126, 236, 125, 132, 243, 157, 158, 252, 158, 156, 237, 121,
				122, 216, 97, 99, 254, 156, 155, 250, 162, 161, 247, 155, 156, 244, 156, 155, 240, 140, 148, 248, 205, 199, 255, 247, 241, 245, 255,
				255, 245, 255, 253, 227, 198, 192, 209, 63, 76, 210, 55, 53, 198, 60, 60, 198, 60, 60, 198, 60, 60, 198, 60, 60, 198, 60, 60, 198, 60,
				60, 198, 60, 60, 198, 60, 60, 205, 55, 67, 209, 55, 57, 203, 56, 62, 203, 56, 62, 203, 56, 62, 203, 56, 62, 203, 56, 62, 203, 56, 62,
				203, 56, 62, 203, 56, 62, 230, 184, 186, 250, 255, 251, 251, 255, 255, 247, 255, 255, 246, 255, 255, 247, 235, 235, 255, 248, 249,
				255, 252, 255, 255, 255, 251, 255, 255, 246, 246, 185, 192, 212, 139, 150, 255, 255, 246, 251, 255, 250, 255, 248, 248, 251, 255, 247,
				252, 240, 242, 244, 248, 247, 255, 253, 255, 255, 247, 255, 255, 249, 255, 242, 197, 204, 204, 61, 79, 204, 55, 59, 203, 56, 62, 203,
				56, 62, 203, 56, 62, 203, 56, 62, 203, 56, 62, 203, 56, 62, 203, 56, 62, 203, 56, 62, 205, 55, 67, 210, 56, 58, 203, 56, 62, 203, 56,
				62, 203, 56, 62, 203, 56, 62, 203, 56, 62, 203, 56, 62, 203, 56, 62, 203, 56, 62, 238, 192, 194, 252, 255, 253, 251, 255, 255, 243,
				254, 255, 248, 255, 255, 255, 251, 251, 255, 247, 248, 255, 252, 255, 255, 255, 251, 255, 255, 246, 240, 179, 186, 200, 127, 138, 255,
				255, 246, 249, 255, 248, 255, 249, 249, 252, 255, 248, 255, 251, 253, 252, 255, 255, 253, 250, 255, 255, 248, 255, 255, 248, 255, 242,
				197, 204, 207, 64, 82, 202, 53, 57, 203, 56, 62, 203, 56, 62, 203, 56, 62, 203, 56, 62, 203, 56, 62, 203, 56, 62, 203, 56, 62, 203,
				56, 62, 198, 56, 68, 205, 58, 51, 201, 58, 64, 201, 58, 64, 201, 58, 64, 201, 58, 64, 201, 58, 64, 201, 58, 64, 201, 58, 64, 201, 58,
				64, 238, 187, 184, 250, 252, 239, 255, 255, 253, 255, 249, 253, 255, 254, 255, 255, 252, 253, 251, 253, 252, 255, 254, 255, 254, 255,
				253, 251, 255, 249, 237, 184, 192, 205, 139, 151, 254, 255, 250, 245, 255, 250, 255, 250, 251, 251, 255, 251, 255, 253, 253, 252, 255,
				255, 249, 251, 250, 249, 255, 255, 253, 255, 249, 227, 203, 191, 193, 67, 70, 204, 55, 49, 201, 58, 64, 201, 58, 64, 201, 58, 64, 201,
				58, 64, 201, 58, 64, 201, 58, 64, 201, 58, 64, 201, 58, 64, 198, 56, 68, 205, 58, 51, 201, 58, 64, 201, 58, 64, 201, 58, 64, 201, 58,
				64, 201, 58, 64, 201, 58, 64, 201, 58, 64, 201, 58, 64, 243, 192, 189, 249, 251, 238, 255, 255, 253, 255, 253, 255, 252, 250, 251,
				255, 252, 253, 254, 255, 255, 252, 250, 255, 254, 255, 253, 248, 253, 246, 236, 183, 191, 217, 151, 163, 249, 252, 245, 247, 255, 252,
				255, 250, 251, 247, 254, 247, 255, 251, 251, 252, 255, 255, 254, 255, 255, 244, 253, 252, 254, 255, 250, 231, 207, 195, 184, 58, 61,
				213, 64, 58, 201, 58, 64, 201, 58, 64, 201, 58, 64, 201, 58, 64, 201, 58, 64, 201, 58, 64, 201, 58, 64, 201, 58, 64, 200, 64, 68, 199,
				54, 61, 200, 60, 61, 200, 60, 61, 200, 60, 61, 200, 60, 61, 200, 60, 61, 200, 60, 61, 200, 60, 61, 200, 60, 61, 224, 192, 197, 245,
				255, 253, 247, 253, 253, 255, 254, 255, 251, 255, 255, 254, 255, 255, 242, 254, 254, 249, 255, 255, 251, 255, 255, 246, 255, 255, 255,
				244, 249, 255, 242, 251, 246, 254, 255, 248, 255, 255, 255, 251, 255, 251, 255, 255, 247, 255, 255, 247, 255, 255, 247, 255, 255, 248,
				255, 255, 255, 252, 253, 235, 201, 199, 199, 67, 80, 209, 49, 59, 199, 59, 62, 199, 59, 62, 199, 59, 62, 198, 58, 61, 198, 58, 61,
				198, 58, 61, 198, 58, 61, 198, 58, 61, 194, 58, 62, 207, 62, 69, 199, 59, 60, 199, 59, 60, 199, 59, 60, 199, 59, 60, 199, 59, 60, 199,
				59, 60, 199, 59, 60, 199, 59, 60, 225, 193, 198, 245, 255, 253, 251, 255, 255, 253, 252, 255, 247, 252, 255, 254, 255, 255, 244, 255,
				255, 249, 255, 255, 251, 255, 255, 248, 255, 255, 255, 248, 253, 255, 246, 255, 249, 255, 255, 248, 255, 255, 255, 251, 255, 252, 255,
				255, 247, 255, 255, 247, 255, 255, 249, 255, 255, 247, 255, 255, 255, 251, 252, 234, 200, 198, 193, 61, 74, 219, 59, 69, 200, 60, 63,
				199, 59, 62, 199, 59, 62, 199, 59, 62, 199, 59, 62, 199, 59, 62, 199, 59, 62, 199, 59, 62, 184, 57, 50, 195, 61, 72, 203, 57, 60, 203,
				57, 60, 203, 57, 60, 203, 57, 60, 203, 57, 60, 203, 57, 60, 203, 57, 60, 203, 57, 60, 221, 186, 192, 253, 254, 248, 255, 252, 250,
				255, 253, 250, 252, 255, 248, 255, 254, 250, 250, 255, 248, 249, 255, 248, 255, 254, 255, 254, 255, 251, 251, 255, 250, 252, 255, 251,
				255, 255, 255, 255, 253, 255, 255, 253, 255, 255, 253, 250, 255, 249, 253, 255, 248, 249, 255, 254, 251, 248, 255, 247, 255, 250, 248,
				241, 203, 200, 184, 59, 73, 205, 54, 69, 202, 57, 62, 202, 57, 62, 202, 57, 62, 202, 57, 62, 202, 57, 62, 202, 57, 62, 202, 57, 62,
				202, 57, 62, 195, 68, 61, 193, 59, 70, 203, 57, 60, 203, 57, 60, 203, 57, 60, 203, 57, 60, 203, 57, 60, 203, 57, 60, 203, 57, 60, 203,
				57, 60, 236, 201, 207, 252, 253, 247, 255, 252, 250, 255, 253, 250, 254, 255, 250, 255, 254, 250, 250, 255, 248, 248, 255, 247, 255,
				252, 253, 253, 255, 250, 251, 255, 250, 252, 255, 251, 255, 255, 255, 255, 252, 255, 255, 252, 254, 255, 253, 250, 255, 248, 252, 255,
				249, 250, 255, 254, 251, 251, 255, 250, 255, 250, 248, 237, 199, 196, 197, 72, 86, 205, 54, 69, 202, 57, 62, 202, 57, 62, 202, 57, 62,
				203, 58, 63, 203, 58, 63, 203, 58, 63, 203, 58, 63, 203, 58, 63,
			]
		),
	},
	{
		c: "cy",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				241, 255, 255, 240, 254, 255, 246, 255, 252, 248, 254, 250, 248, 254, 250, 249, 253, 252, 251, 253, 252, 251, 253, 252, 252, 252, 254,
				252, 252, 254, 253, 252, 255, 253, 252, 255, 254, 251, 255, 254, 251, 255, 254, 250, 255, 253, 249, 255, 252, 250, 255, 252, 249, 255,
				250, 248, 255, 248, 249, 255, 249, 252, 255, 248, 254, 252, 246, 255, 247, 244, 255, 242, 243, 255, 242, 242, 255, 243, 242, 255, 246,
				244, 255, 250, 246, 255, 254, 246, 255, 255, 244, 254, 253, 244, 253, 250, 245, 254, 251, 247, 255, 255, 248, 255, 255, 248, 255, 255,
				248, 255, 255, 247, 255, 255, 247, 255, 255, 245, 255, 255, 242, 255, 255, 238, 255, 255, 242, 255, 255, 233, 247, 248, 248, 254, 254,
				251, 253, 250, 252, 252, 250, 252, 252, 250, 255, 251, 250, 255, 251, 250, 255, 250, 250, 255, 250, 250, 255, 252, 253, 255, 252, 253,
				255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 254, 254, 255, 254, 255, 255,
				252, 255, 255, 251, 255, 248, 249, 255, 244, 248, 255, 243, 248, 255, 245, 246, 253, 246, 247, 253, 253, 249, 252, 255, 251, 251, 255,
				252, 251, 255, 252, 251, 247, 254, 252, 240, 253, 253, 241, 254, 254, 252, 253, 254, 255, 254, 253, 255, 253, 254, 255, 250, 254, 255,
				249, 254, 255, 245, 255, 255, 240, 255, 255, 237, 252, 255, 247, 255, 255, 249, 255, 255, 251, 255, 255, 252, 255, 255, 252, 255, 253,
				255, 255, 251, 255, 255, 250, 255, 255, 250, 255, 255, 248, 254, 254, 244, 254, 254, 244, 253, 255, 244, 251, 254, 243, 251, 254, 243,
				249, 255, 243, 249, 255, 245, 249, 255, 245, 254, 254, 246, 255, 254, 249, 255, 254, 249, 254, 255, 249, 253, 255, 249, 252, 255, 248,
				250, 255, 249, 249, 254, 250, 252, 255, 255, 253, 254, 255, 253, 253, 255, 254, 253, 255, 255, 254, 255, 255, 253, 250, 255, 254, 242,
				255, 253, 241, 255, 255, 253, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 255, 255, 254, 255, 255, 249, 255, 255, 245, 255, 255,
				240, 254, 255, 246, 255, 255, 248, 255, 255, 250, 255, 255, 250, 255, 254, 251, 255, 252, 251, 255, 250, 253, 255, 249, 253, 255, 247,
				253, 255, 247, 254, 255, 246, 252, 255, 244, 252, 255, 243, 251, 255, 243, 249, 255, 243, 247, 255, 240, 247, 255, 240, 248, 255, 243,
				254, 255, 250, 255, 254, 250, 255, 255, 248, 255, 255, 244, 254, 255, 245, 254, 255, 247, 253, 253, 253, 253, 252, 255, 253, 252, 255,
				252, 249, 255, 251, 249, 252, 253, 249, 246, 255, 251, 240, 255, 250, 234, 255, 248, 230, 251, 245, 231, 255, 253, 250, 255, 253, 255,
				255, 252, 255, 255, 253, 255, 255, 253, 255, 254, 254, 255, 249, 254, 255, 245, 255, 255, 249, 255, 255, 251, 255, 255, 251, 255, 255,
				252, 255, 255, 252, 255, 255, 252, 255, 255, 252, 255, 253, 252, 255, 253, 252, 255, 251, 252, 255, 251, 249, 255, 248, 246, 255, 245,
				244, 255, 241, 248, 255, 246, 244, 255, 241, 241, 255, 239, 245, 255, 243, 238, 251, 244, 251, 253, 255, 247, 248, 255, 245, 250, 246,
				250, 255, 239, 254, 255, 236, 255, 255, 241, 255, 255, 255, 255, 252, 255, 246, 239, 255, 255, 252, 255, 255, 253, 242, 255, 250, 224,
				254, 246, 209, 224, 215, 176, 205, 192, 160, 223, 212, 190, 255, 255, 248, 255, 255, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255,
				254, 255, 255, 251, 255, 255, 247, 255, 255, 252, 255, 255, 253, 254, 255, 254, 254, 254, 254, 254, 252, 254, 254, 254, 253, 255, 254,
				253, 254, 255, 253, 254, 255, 251, 255, 255, 251, 255, 255, 245, 251, 251, 249, 255, 253, 249, 255, 251, 244, 254, 246, 244, 254, 243,
				248, 255, 245, 248, 255, 245, 249, 255, 255, 245, 250, 255, 248, 253, 255, 251, 255, 253, 252, 255, 239, 254, 255, 233, 251, 253, 232,
				251, 246, 243, 253, 244, 247, 255, 248, 248, 255, 244, 233, 251, 238, 203, 248, 236, 186, 216, 203, 150, 173, 156, 110, 217, 198, 168,
				255, 247, 232, 255, 255, 250, 254, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 255, 253, 254, 255, 250, 255, 255, 246, 255, 255,
				254, 255, 255, 254, 252, 255, 255, 252, 252, 255, 252, 250, 255, 252, 252, 255, 252, 255, 255, 253, 255, 255, 252, 255, 254, 252, 255,
				254, 252, 255, 249, 247, 255, 255, 253, 255, 255, 253, 255, 248, 246, 251, 255, 251, 252, 255, 254, 253, 254, 249, 245, 250, 249, 245,
				243, 249, 247, 246, 255, 251, 251, 255, 246, 254, 255, 243, 255, 255, 241, 255, 255, 241, 255, 253, 241, 255, 249, 229, 255, 243, 207,
				255, 241, 188, 214, 196, 124, 172, 154, 80, 204, 182, 124, 251, 225, 188, 255, 246, 241, 255, 240, 246, 255, 253, 254, 251, 255, 254,
				251, 255, 254, 253, 255, 254, 253, 254, 255, 250, 254, 255, 247, 255, 255, 245, 255, 255, 255, 255, 255, 255, 252, 253, 255, 252, 249,
				255, 252, 249, 255, 252, 251, 254, 252, 255, 253, 252, 255, 252, 252, 255, 252, 252, 255, 252, 251, 255, 248, 248, 255, 255, 253, 255,
				255, 253, 255, 255, 248, 251, 255, 252, 250, 255, 248, 240, 255, 242, 232, 218, 205, 186, 252, 248, 211, 254, 251, 208, 254, 248, 212,
				255, 245, 213, 255, 246, 218, 255, 246, 215, 255, 233, 191, 241, 216, 162, 224, 199, 132, 175, 152, 76, 173, 151, 75, 220, 199, 132,
				255, 239, 196, 255, 250, 232, 255, 241, 249, 255, 248, 255, 255, 253, 255, 251, 255, 254, 250, 254, 253, 252, 254, 253, 252, 253, 255,
				250, 254, 255, 247, 255, 255, 243, 255, 255, 255, 254, 255, 254, 253, 251, 252, 254, 249, 250, 255, 249, 249, 255, 251, 247, 255, 255,
				245, 255, 255, 245, 255, 255, 245, 255, 255, 245, 255, 255, 243, 250, 255, 252, 254, 253, 251, 248, 241, 255, 255, 239, 255, 253, 232,
				255, 245, 217, 255, 245, 211, 190, 164, 113, 200, 172, 89, 220, 186, 96, 238, 200, 125, 250, 209, 143, 255, 211, 146, 244, 200, 127,
				213, 172, 82, 179, 143, 46, 185, 152, 57, 187, 160, 79, 217, 194, 140, 255, 253, 225, 253, 242, 238, 255, 250, 255, 253, 252, 255,
				244, 246, 255, 250, 254, 255, 252, 254, 253, 252, 254, 253, 252, 254, 253, 252, 253, 255, 250, 254, 255, 245, 255, 255, 242, 255, 255,
				255, 255, 253, 254, 253, 249, 252, 254, 249, 249, 255, 249, 247, 255, 253, 246, 255, 255, 243, 255, 255, 243, 255, 255, 243, 255, 255,
				246, 255, 255, 250, 255, 249, 255, 255, 243, 255, 248, 225, 255, 242, 208, 255, 245, 201, 255, 238, 184, 255, 241, 179, 196, 155, 73,
				199, 149, 38, 206, 151, 32, 205, 146, 46, 202, 138, 48, 203, 138, 46, 208, 146, 43, 209, 155, 33, 204, 156, 32, 204, 162, 52, 255,
				233, 151, 255, 227, 187, 255, 251, 241, 255, 251, 255, 249, 252, 255, 245, 255, 255, 245, 255, 255, 249, 255, 255, 253, 253, 253, 253,
				253, 253, 253, 253, 253, 253, 253, 255, 250, 254, 255, 246, 255, 255, 241, 255, 255, 255, 255, 251, 252, 251, 247, 254, 253, 249, 254,
				253, 251, 252, 253, 255, 250, 254, 255, 249, 254, 255, 249, 254, 255, 249, 255, 253, 253, 254, 246, 251, 248, 229, 255, 251, 221, 255,
				239, 196, 223, 192, 135, 237, 197, 125, 250, 202, 118, 255, 202, 109, 215, 154, 47, 215, 151, 25, 223, 154, 25, 227, 154, 41, 227,
				153, 46, 226, 150, 40, 220, 148, 28, 215, 149, 13, 209, 149, 17, 196, 144, 32, 255, 220, 141, 255, 248, 212, 255, 242, 231, 255, 252,
				253, 251, 255, 253, 236, 255, 231, 240, 255, 233, 251, 255, 249, 255, 253, 254, 255, 253, 255, 254, 252, 255, 253, 252, 255, 250, 254,
				255, 246, 255, 255, 242, 255, 255, 255, 255, 251, 253, 250, 245, 255, 254, 247, 255, 255, 247, 254, 254, 254, 253, 254, 255, 251, 254,
				255, 251, 255, 255, 253, 255, 249, 255, 255, 235, 243, 231, 193, 255, 235, 181, 255, 219, 148, 181, 133, 49, 195, 139, 42, 216, 155,
				49, 211, 151, 39, 210, 146, 23, 226, 154, 18, 223, 147, 10, 222, 142, 17, 225, 145, 24, 230, 150, 29, 229, 151, 25, 223, 153, 21, 216,
				155, 30, 222, 170, 68, 176, 137, 62, 255, 249, 210, 255, 252, 236, 247, 244, 235, 251, 255, 246, 247, 255, 234, 248, 255, 236, 253,
				255, 249, 255, 253, 255, 255, 252, 255, 255, 253, 255, 253, 253, 255, 252, 253, 255, 249, 254, 255, 242, 255, 255, 254, 253, 248, 255,
				251, 241, 255, 255, 236, 254, 255, 237, 254, 255, 248, 252, 255, 255, 249, 255, 255, 249, 255, 255, 254, 255, 243, 255, 255, 221, 223,
				202, 137, 192, 155, 67, 212, 153, 49, 217, 147, 33, 217, 146, 28, 226, 161, 41, 204, 152, 34, 210, 154, 31, 220, 148, 10, 228, 149, 5,
				221, 143, 7, 225, 148, 18, 225, 150, 25, 218, 146, 28, 217, 151, 39, 204, 149, 48, 177, 137, 50, 221, 198, 130, 187, 181, 133, 255,
				255, 228, 251, 255, 240, 240, 248, 237, 255, 255, 250, 254, 253, 249, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 255, 255, 255,
				255, 255, 254, 255, 255, 254, 254, 255, 244, 255, 255, 255, 253, 248, 255, 249, 243, 255, 255, 237, 252, 255, 239, 252, 255, 253, 252,
				255, 255, 249, 255, 255, 251, 255, 255, 255, 255, 244, 255, 255, 220, 255, 234, 166, 197, 154, 60, 199, 136, 23, 234, 160, 35, 229,
				154, 26, 215, 146, 17, 212, 154, 29, 213, 156, 27, 220, 149, 9, 233, 156, 14, 226, 152, 17, 220, 149, 25, 213, 145, 34, 219, 160, 60,
				252, 202, 117, 255, 231, 160, 246, 224, 164, 254, 243, 197, 249, 251, 214, 240, 245, 222, 252, 255, 244, 254, 255, 251, 248, 246, 249,
				254, 249, 255, 255, 253, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 254, 255, 253, 255, 255, 255, 255, 253, 255, 246, 255, 255,
				255, 252, 249, 255, 249, 249, 255, 255, 251, 252, 255, 255, 254, 254, 255, 254, 252, 255, 254, 252, 255, 255, 252, 255, 255, 253, 255,
				255, 255, 236, 255, 254, 207, 206, 172, 100, 219, 166, 70, 212, 149, 35, 213, 142, 18, 227, 153, 20, 229, 159, 25, 211, 142, 5, 222,
				150, 14, 231, 161, 31, 225, 154, 36, 212, 147, 45, 199, 144, 61, 206, 167, 100, 243, 221, 171, 255, 255, 220, 255, 255, 232, 245, 245,
				233, 255, 254, 253, 255, 251, 255, 255, 251, 255, 249, 247, 252, 254, 255, 255, 247, 251, 254, 254, 255, 255, 255, 254, 255, 255, 255,
				255, 255, 255, 255, 254, 255, 253, 255, 255, 255, 255, 253, 255, 246, 255, 255, 255, 254, 251, 255, 251, 255, 255, 253, 255, 252, 254,
				255, 255, 252, 255, 255, 251, 255, 255, 251, 255, 255, 250, 255, 255, 252, 255, 255, 253, 244, 255, 249, 220, 255, 243, 193, 186, 154,
				81, 190, 145, 52, 198, 141, 34, 221, 154, 37, 213, 139, 14, 228, 158, 34, 209, 152, 39, 197, 145, 44, 186, 136, 49, 206, 162, 89, 236,
				203, 149, 255, 238, 198, 255, 255, 232, 251, 253, 242, 252, 255, 255, 254, 254, 255, 246, 240, 254, 255, 248, 255, 255, 250, 255, 253,
				248, 255, 243, 247, 248, 251, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 253, 255, 255, 255, 255,
				253, 255, 246, 255, 255, 255, 254, 251, 255, 250, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 252, 255, 255, 251, 255, 255,
				251, 255, 255, 252, 255, 255, 254, 251, 253, 251, 238, 245, 244, 214, 238, 234, 187, 225, 209, 149, 206, 174, 99, 216, 168, 83, 227,
				161, 67, 205, 145, 57, 228, 197, 130, 233, 217, 165, 239, 226, 181, 249, 239, 203, 249, 245, 218, 248, 246, 231, 252, 253, 248, 249,
				248, 253, 249, 247, 255, 255, 251, 255, 255, 252, 255, 254, 248, 255, 236, 231, 237, 255, 254, 255, 242, 244, 239, 254, 255, 251, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 253, 255, 255, 255, 255, 253, 255, 246, 255, 255, 255, 254, 251, 255,
				249, 251, 255, 252, 255, 255, 254, 255, 255, 254, 255, 255, 254, 253, 255, 254, 251, 255, 254, 251, 255, 254, 251, 255, 255, 251, 248,
				255, 251, 179, 197, 181, 177, 197, 172, 226, 240, 204, 242, 239, 194, 252, 229, 175, 255, 227, 166, 198, 155, 102, 255, 238, 208, 252,
				249, 230, 248, 251, 234, 252, 255, 244, 249, 255, 248, 248, 255, 251, 249, 255, 255, 243, 251, 253, 244, 252, 255, 241, 251, 253, 189,
				200, 202, 158, 169, 171, 207, 217, 218, 250, 255, 255, 254, 255, 255, 250, 248, 249, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 254, 255, 253, 255, 255, 255, 255, 253, 255, 246, 255, 255, 254, 254, 252, 255, 248, 250, 255, 252, 255, 255, 254, 251, 255,
				255, 246, 255, 255, 243, 255, 255, 239, 255, 255, 239, 255, 255, 243, 251, 255, 246, 240, 255, 252, 190, 223, 214, 12, 58, 45, 120,
				164, 147, 204, 235, 217, 248, 255, 239, 255, 246, 224, 254, 233, 216, 255, 239, 237, 255, 252, 253, 255, 252, 251, 248, 253, 247, 241,
				251, 240, 238, 252, 239, 244, 255, 245, 236, 255, 243, 235, 255, 248, 189, 228, 209, 54, 101, 83, 57, 101, 88, 213, 248, 242, 239,
				255, 255, 242, 244, 255, 252, 246, 255, 255, 253, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 253, 255, 255, 255, 255,
				253, 255, 246, 255, 255, 251, 255, 252, 255, 250, 251, 255, 252, 253, 255, 254, 251, 255, 255, 246, 254, 255, 241, 255, 255, 237, 255,
				255, 237, 255, 255, 241, 249, 255, 246, 238, 255, 251, 209, 249, 241, 143, 199, 190, 27, 87, 79, 78, 129, 122, 206, 246, 238, 220,
				239, 233, 252, 255, 255, 255, 250, 255, 255, 251, 255, 253, 248, 252, 251, 251, 249, 251, 255, 250, 247, 255, 246, 240, 255, 246, 221,
				255, 232, 173, 221, 195, 47, 103, 76, 55, 115, 89, 145, 200, 179, 221, 255, 252, 232, 255, 255, 240, 244, 255, 255, 253, 255, 255,
				254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 253, 255, 255, 255, 255, 253, 255, 246, 255, 255, 241, 252, 248, 255,
				253, 254, 255, 253, 255, 255, 254, 255, 254, 255, 253, 251, 255, 250, 252, 255, 246, 254, 255, 246, 255, 255, 246, 252, 255, 250, 241,
				255, 249, 228, 255, 251, 209, 255, 248, 68, 128, 116, 67, 127, 115, 98, 151, 141, 139, 180, 172, 222, 251, 246, 238, 253, 246, 245,
				250, 244, 255, 255, 251, 255, 255, 251, 250, 252, 247, 242, 255, 246, 200, 231, 216, 138, 183, 163, 77, 132, 109, 67, 127, 102, 105,
				158, 138, 225, 255, 251, 224, 252, 240, 240, 255, 249, 251, 255, 253, 248, 250, 249, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254,
				254, 252, 253, 255, 252, 254, 254, 254, 255, 253, 255, 246, 255, 255, 240, 255, 251, 255, 255, 255, 254, 252, 253, 253, 253, 253, 249,
				255, 253, 247, 255, 253, 249, 255, 253, 252, 254, 253, 255, 252, 253, 255, 252, 253, 243, 247, 248, 244, 255, 255, 225, 255, 251, 215,
				255, 248, 163, 215, 202, 36, 88, 75, 56, 103, 93, 75, 115, 104, 145, 176, 161, 203, 223, 211, 248, 255, 251, 241, 250, 247, 196, 206,
				205, 133, 152, 148, 81, 112, 106, 57, 99, 89, 82, 128, 117, 189, 233, 220, 210, 243, 232, 237, 255, 248, 246, 255, 249, 252, 255, 246,
				243, 247, 233, 253, 254, 246, 255, 255, 253, 255, 255, 255, 255, 255, 255, 255, 255, 253, 254, 255, 253, 255, 255, 253, 255, 254, 255,
				245, 255, 255, 241, 255, 255, 251, 255, 254, 254, 255, 250, 252, 255, 250, 249, 255, 255, 248, 255, 255, 249, 255, 255, 254, 254, 255,
				255, 250, 255, 255, 249, 255, 255, 248, 255, 255, 253, 255, 237, 243, 241, 241, 255, 250, 237, 255, 251, 204, 238, 222, 197, 233, 219,
				117, 155, 140, 77, 118, 104, 117, 157, 146, 167, 202, 195, 159, 189, 187, 104, 132, 133, 87, 115, 118, 135, 163, 167, 185, 210, 214,
				209, 228, 232, 245, 255, 255, 237, 241, 242, 253, 252, 248, 255, 254, 246, 255, 249, 236, 250, 245, 226, 255, 255, 241, 255, 255, 253,
				255, 254, 255, 255, 255, 255, 255, 255, 253, 254, 255, 251, 255, 255, 253, 255, 253, 254, 244, 255, 255, 240, 255, 255, 242, 251, 246,
				251, 255, 246, 251, 255, 246, 249, 255, 251, 249, 255, 255, 251, 255, 255, 255, 253, 255, 255, 250, 255, 255, 248, 255, 255, 247, 255,
				252, 235, 245, 255, 248, 252, 255, 254, 251, 240, 247, 239, 230, 248, 236, 231, 255, 242, 225, 255, 243, 224, 254, 244, 190, 223, 214,
				132, 167, 161, 132, 168, 164, 194, 228, 227, 224, 254, 254, 222, 246, 250, 237, 254, 255, 249, 255, 255, 247, 247, 255, 255, 250, 255,
				255, 252, 255, 254, 242, 242, 252, 241, 235, 255, 253, 244, 254, 245, 238, 255, 254, 255, 255, 253, 255, 254, 254, 254, 254, 254, 252,
				253, 255, 250, 254, 255, 250, 255, 254, 252, 244, 255, 255, 236, 255, 255, 242, 251, 246, 249, 255, 244, 251, 255, 243, 251, 255, 248,
				252, 255, 253, 254, 255, 255, 255, 254, 255, 255, 252, 255, 255, 250, 255, 253, 237, 248, 255, 248, 255, 255, 244, 251, 255, 250, 253,
				255, 247, 248, 255, 255, 253, 248, 255, 255, 243, 254, 250, 250, 249, 247, 242, 242, 240, 235, 250, 243, 232, 255, 245, 225, 255, 245,
				233, 255, 251, 241, 255, 255, 243, 255, 255, 236, 244, 246, 248, 253, 255, 251, 255, 255, 252, 255, 255, 252, 250, 255, 255, 249, 255,
				255, 248, 255, 255, 238, 254, 255, 252, 255, 255, 254, 255, 255, 255, 255, 255, 255, 253, 253, 255, 250, 254, 255, 250, 255, 254, 252,
				244, 255, 254, 234, 254, 252, 249, 255, 255, 251, 255, 250, 252, 255, 248, 255, 255, 251, 255, 255, 253, 255, 254, 255, 255, 254, 255,
				255, 255, 255, 255, 254, 255, 255, 249, 251, 255, 251, 255, 255, 241, 245, 255, 247, 251, 255, 247, 252, 246, 240, 244, 248, 252, 253,
				249, 253, 254, 255, 249, 252, 255, 252, 253, 254, 255, 251, 242, 252, 244, 247, 255, 251, 247, 255, 250, 236, 247, 239, 243, 253, 245,
				251, 255, 253, 246, 255, 252, 236, 246, 247, 240, 250, 252, 251, 255, 255, 255, 253, 255, 255, 247, 255, 255, 248, 255, 255, 251, 255,
				255, 254, 255, 255, 255, 255, 255, 255, 253, 254, 255, 253, 254, 255, 251, 255, 255, 253, 245, 255, 253, 240, 255, 255, 250, 255, 255,
				252, 255, 255, 254, 254, 255, 255, 252, 255, 255, 252, 255, 255, 253, 253, 255, 255, 250, 251, 255, 248, 249, 255, 246, 248, 255, 245,
				245, 248, 239, 255, 252, 248, 255, 245, 244, 255, 251, 254, 255, 254, 255, 247, 255, 255, 243, 255, 255, 241, 251, 252, 239, 248, 247,
				254, 254, 254, 255, 251, 253, 246, 236, 237, 252, 242, 241, 255, 254, 250, 255, 255, 248, 245, 250, 243, 247, 255, 248, 249, 255, 250,
				249, 255, 251, 242, 247, 243, 253, 255, 254, 255, 253, 254, 250, 245, 249, 255, 254, 255, 255, 254, 255, 254, 254, 255, 254, 254, 252,
				253, 255, 252, 253, 255, 250, 255, 254, 250, 244, 255, 252, 238, 255, 255, 232, 246, 247, 240, 253, 255, 243, 252, 255, 247, 250, 255,
				249, 250, 252, 247, 252, 246, 244, 254, 243, 239, 255, 239, 235, 255, 239, 241, 255, 244, 234, 255, 238, 248, 255, 250, 251, 255, 251,
				246, 252, 250, 236, 246, 245, 242, 255, 255, 234, 255, 253, 237, 255, 255, 234, 255, 254, 244, 254, 255, 253, 254, 255, 255, 249, 253,
				255, 249, 251, 252, 252, 250, 244, 251, 244, 239, 255, 244, 242, 255, 248, 236, 254, 242, 239, 255, 245, 242, 255, 248, 247, 255, 251,
				236, 249, 242, 246, 255, 254, 245, 255, 254, 245, 255, 255, 244, 255, 254, 244, 255, 252, 242, 255, 250, 241, 255, 249, 243, 255, 249,
				234, 255, 249,
			]
		),
	},
	{
		c: "co",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				203, 187, 109, 224, 206, 107, 222, 202, 92, 222, 202, 83, 232, 212, 91, 221, 201, 78, 224, 204, 78, 226, 207, 78, 227, 207, 76, 228,
				207, 76, 228, 206, 76, 228, 205, 78, 228, 204, 81, 226, 203, 83, 225, 202, 83, 227, 203, 80, 228, 204, 80, 230, 206, 83, 230, 206, 82,
				228, 204, 82, 227, 203, 79, 227, 203, 79, 227, 203, 79, 229, 205, 80, 229, 205, 81, 229, 205, 81, 229, 205, 81, 229, 205, 81, 229,
				205, 81, 229, 206, 81, 230, 206, 82, 230, 206, 82, 230, 204, 83, 230, 204, 83, 229, 204, 86, 228, 206, 87, 229, 207, 89, 227, 205, 92,
				224, 200, 98, 220, 196, 104, 228, 205, 122, 173, 152, 82, 209, 195, 91, 239, 219, 72, 238, 214, 50, 239, 213, 44, 237, 214, 53, 235,
				215, 58, 234, 217, 59, 235, 218, 57, 238, 217, 55, 242, 215, 52, 244, 215, 50, 246, 214, 50, 245, 213, 53, 244, 213, 57, 243, 213, 58,
				243, 213, 57, 243, 214, 56, 243, 214, 57, 243, 215, 56, 243, 214, 57, 243, 214, 56, 243, 214, 56, 243, 214, 56, 243, 214, 56, 243,
				214, 56, 243, 214, 56, 243, 214, 56, 243, 214, 56, 243, 214, 56, 243, 214, 56, 243, 215, 56, 243, 214, 56, 243, 214, 56, 243, 215, 57,
				239, 215, 59, 238, 215, 57, 239, 216, 54, 241, 216, 59, 240, 210, 71, 234, 205, 81, 243, 220, 103, 183, 168, 68, 211, 197, 70, 243,
				223, 43, 245, 217, 20, 247, 217, 19, 242, 216, 33, 240, 218, 42, 237, 219, 42, 237, 219, 40, 241, 218, 38, 245, 216, 35, 249, 215, 31,
				251, 214, 28, 250, 214, 31, 248, 215, 36, 247, 215, 37, 247, 215, 37, 247, 215, 37, 247, 215, 37, 247, 215, 37, 247, 215, 37, 247,
				215, 37, 247, 215, 37, 247, 215, 37, 247, 216, 38, 247, 216, 38, 247, 216, 38, 247, 216, 38, 247, 216, 38, 247, 216, 38, 247, 216, 38,
				247, 216, 38, 247, 216, 38, 246, 214, 36, 245, 216, 37, 241, 216, 38, 240, 216, 34, 241, 218, 29, 244, 217, 34, 244, 211, 48, 238,
				205, 58, 244, 220, 82, 184, 169, 51, 214, 199, 47, 247, 225, 26, 249, 218, 14, 251, 216, 17, 247, 215, 31, 244, 217, 39, 240, 218, 37,
				239, 219, 34, 243, 217, 34, 247, 216, 32, 249, 215, 27, 250, 216, 22, 249, 216, 22, 247, 216, 26, 247, 216, 29, 247, 216, 30, 249,
				215, 31, 249, 215, 31, 249, 215, 31, 249, 215, 31, 249, 215, 31, 249, 215, 31, 249, 215, 31, 249, 216, 32, 250, 216, 32, 250, 216, 32,
				250, 216, 32, 250, 216, 32, 250, 216, 32, 250, 216, 32, 249, 216, 32, 248, 216, 32, 246, 214, 33, 245, 215, 33, 242, 216, 32, 241,
				216, 28, 244, 217, 23, 246, 216, 28, 246, 210, 40, 240, 205, 49, 247, 219, 73, 187, 169, 45, 217, 200, 42, 248, 225, 24, 251, 216, 18,
				253, 215, 23, 249, 214, 34, 246, 215, 37, 243, 218, 32, 242, 220, 28, 244, 218, 30, 247, 217, 31, 249, 217, 27, 249, 217, 23, 248,
				218, 22, 246, 219, 23, 246, 218, 26, 247, 217, 28, 248, 217, 29, 248, 216, 30, 248, 217, 29, 248, 217, 30, 248, 217, 29, 248, 217, 30,
				248, 217, 29, 248, 217, 30, 248, 217, 29, 248, 217, 30, 248, 217, 30, 248, 217, 29, 248, 217, 30, 248, 217, 29, 248, 217, 30, 247,
				217, 31, 246, 216, 34, 246, 216, 34, 243, 217, 30, 242, 217, 27, 245, 218, 22, 248, 217, 26, 248, 212, 34, 242, 207, 40, 248, 222, 65,
				189, 171, 41, 218, 199, 57, 246, 223, 37, 249, 213, 32, 253, 214, 35, 250, 213, 39, 246, 214, 34, 243, 220, 23, 242, 222, 19, 243,
				221, 24, 245, 219, 29, 246, 218, 29, 247, 219, 26, 244, 220, 26, 243, 221, 27, 243, 220, 28, 244, 219, 28, 244, 219, 27, 245, 218, 29,
				244, 219, 27, 245, 218, 28, 245, 219, 27, 245, 219, 28, 245, 219, 27, 245, 219, 28, 245, 219, 27, 245, 219, 28, 245, 219, 28, 245,
				219, 27, 245, 219, 28, 245, 219, 27, 245, 218, 29, 244, 219, 31, 244, 217, 36, 245, 218, 37, 243, 219, 30, 242, 219, 25, 245, 219, 22,
				248, 219, 24, 247, 216, 26, 241, 211, 29, 248, 225, 54, 189, 173, 34, 218, 199, 69, 245, 221, 47, 246, 211, 42, 251, 212, 44, 249,
				212, 42, 246, 213, 33, 244, 219, 18, 243, 222, 12, 243, 221, 20, 243, 219, 29, 244, 218, 30, 244, 219, 28, 242, 220, 29, 240, 220, 30,
				240, 220, 30, 241, 220, 28, 242, 219, 27, 243, 219, 27, 242, 219, 27, 243, 219, 27, 242, 219, 27, 243, 219, 27, 243, 219, 27, 243,
				220, 28, 243, 220, 28, 243, 220, 28, 243, 220, 28, 243, 220, 28, 243, 220, 28, 243, 220, 27, 243, 220, 29, 243, 219, 32, 242, 217, 37,
				243, 218, 38, 242, 219, 30, 242, 219, 23, 245, 219, 23, 247, 219, 22, 246, 217, 20, 239, 213, 21, 246, 226, 47, 187, 173, 30, 220,
				201, 65, 244, 222, 42, 244, 211, 40, 250, 212, 45, 251, 212, 45, 248, 212, 35, 247, 217, 19, 246, 220, 12, 245, 219, 21, 245, 217, 31,
				245, 216, 32, 244, 217, 29, 243, 218, 29, 241, 219, 30, 241, 219, 31, 242, 219, 29, 244, 218, 28, 244, 218, 28, 244, 218, 28, 244,
				218, 28, 244, 218, 28, 244, 218, 28, 244, 218, 28, 244, 219, 29, 245, 219, 29, 245, 219, 29, 245, 219, 29, 245, 219, 29, 245, 219, 29,
				245, 219, 29, 245, 219, 30, 244, 218, 33, 244, 216, 38, 244, 216, 38, 244, 217, 29, 244, 217, 24, 247, 216, 26, 248, 218, 25, 245,
				216, 20, 238, 213, 20, 246, 226, 48, 187, 171, 31, 220, 203, 57, 243, 224, 34, 243, 212, 34, 250, 214, 41, 253, 213, 45, 251, 212, 38,
				251, 216, 23, 250, 218, 17, 249, 217, 26, 248, 215, 35, 247, 216, 34, 246, 217, 31, 245, 217, 30, 244, 218, 32, 244, 218, 33, 245,
				217, 31, 246, 217, 30, 246, 217, 30, 246, 217, 30, 246, 217, 30, 246, 217, 30, 246, 217, 30, 246, 217, 30, 246, 217, 30, 246, 218, 30,
				246, 218, 30, 246, 218, 30, 246, 218, 30, 246, 218, 30, 246, 218, 30, 246, 218, 31, 246, 217, 35, 246, 215, 39, 246, 215, 38, 247,
				216, 29, 247, 215, 25, 249, 215, 30, 250, 216, 30, 246, 215, 23, 239, 212, 24, 247, 226, 55, 188, 170, 38, 217, 202, 54, 238, 224, 30,
				240, 215, 29, 247, 216, 36, 252, 217, 44, 251, 213, 37, 252, 215, 26, 252, 217, 21, 250, 216, 29, 249, 215, 37, 248, 216, 36, 247,
				217, 33, 247, 217, 33, 247, 217, 35, 247, 217, 35, 247, 217, 33, 247, 217, 32, 247, 217, 32, 247, 217, 32, 247, 217, 32, 247, 217, 32,
				247, 217, 32, 247, 217, 32, 247, 217, 32, 247, 217, 32, 247, 217, 32, 247, 217, 32, 247, 217, 32, 247, 217, 32, 247, 217, 32, 247,
				217, 33, 247, 217, 35, 247, 215, 38, 248, 216, 37, 249, 216, 29, 249, 215, 27, 250, 214, 32, 250, 216, 34, 245, 216, 28, 236, 212, 28,
				245, 226, 62, 187, 170, 45, 216, 203, 58, 234, 224, 32, 236, 219, 26, 240, 217, 29, 251, 220, 41, 250, 215, 36, 251, 215, 26, 251,
				216, 22, 249, 216, 28, 248, 215, 35, 247, 216, 34, 246, 216, 32, 247, 216, 34, 248, 215, 37, 248, 215, 36, 246, 216, 33, 246, 216, 32,
				246, 216, 32, 246, 216, 32, 246, 216, 32, 246, 216, 32, 246, 216, 32, 246, 216, 32, 246, 216, 32, 246, 216, 32, 246, 216, 32, 246,
				216, 32, 246, 216, 32, 246, 216, 32, 246, 216, 32, 246, 216, 32, 246, 216, 33, 246, 216, 34, 248, 217, 33, 250, 217, 26, 249, 215, 25,
				250, 214, 33, 249, 216, 37, 242, 216, 32, 232, 212, 33, 240, 223, 65, 185, 169, 49, 222, 208, 67, 236, 227, 40, 235, 221, 27, 236,
				217, 23, 248, 221, 35, 249, 216, 31, 249, 215, 22, 249, 216, 19, 247, 216, 24, 245, 216, 29, 245, 216, 31, 245, 215, 31, 246, 214, 33,
				248, 213, 36, 248, 214, 34, 245, 216, 30, 245, 216, 28, 245, 216, 28, 245, 216, 28, 245, 216, 28, 245, 216, 28, 245, 216, 28, 245,
				216, 28, 245, 216, 28, 245, 216, 28, 245, 216, 28, 245, 216, 28, 245, 216, 28, 245, 216, 28, 245, 216, 28, 245, 216, 28, 245, 216, 27,
				245, 216, 26, 246, 217, 23, 249, 217, 19, 248, 215, 20, 248, 214, 31, 247, 216, 37, 239, 215, 36, 230, 211, 40, 236, 219, 69, 186,
				167, 51, 219, 203, 75, 234, 225, 56, 234, 225, 43, 233, 219, 34, 241, 219, 41, 239, 213, 34, 244, 216, 31, 245, 218, 29, 243, 219, 31,
				242, 219, 36, 241, 218, 40, 242, 217, 43, 244, 216, 45, 246, 214, 47, 245, 215, 45, 243, 217, 40, 241, 218, 37, 241, 218, 37, 241,
				218, 37, 241, 218, 37, 241, 218, 37, 241, 218, 37, 241, 218, 37, 241, 218, 37, 241, 218, 37, 241, 218, 37, 241, 218, 37, 241, 218, 37,
				241, 218, 37, 241, 218, 37, 241, 218, 37, 241, 218, 35, 241, 218, 31, 242, 218, 27, 244, 217, 27, 244, 215, 30, 243, 215, 39, 241,
				216, 47, 234, 214, 50, 227, 211, 57, 237, 222, 87, 186, 168, 61, 188, 184, 96, 203, 208, 92, 204, 211, 85, 206, 211, 82, 212, 209, 88,
				211, 204, 84, 213, 203, 80, 212, 204, 77, 209, 205, 78, 207, 205, 81, 206, 205, 86, 207, 204, 89, 210, 202, 89, 214, 201, 88, 213,
				201, 87, 211, 203, 84, 208, 204, 83, 208, 204, 83, 208, 204, 83, 208, 204, 83, 208, 204, 83, 208, 204, 83, 208, 204, 83, 208, 204, 83,
				208, 204, 83, 208, 204, 83, 208, 204, 83, 208, 204, 83, 208, 204, 83, 208, 204, 83, 208, 204, 83, 208, 204, 81, 208, 204, 78, 208,
				203, 76, 211, 201, 76, 213, 200, 79, 210, 201, 84, 207, 201, 88, 202, 201, 92, 197, 199, 99, 206, 207, 118, 163, 159, 84, 93, 112, 83,
				92, 118, 86, 85, 116, 82, 86, 117, 87, 92, 115, 93, 93, 113, 96, 93, 111, 94, 91, 111, 92, 88, 113, 91, 85, 115, 92, 84, 114, 96, 85,
				113, 98, 89, 112, 95, 93, 111, 89, 93, 111, 88, 90, 112, 91, 88, 113, 93, 88, 113, 93, 88, 113, 93, 88, 113, 93, 88, 113, 93, 88, 113,
				93, 88, 113, 93, 88, 113, 93, 88, 113, 93, 88, 113, 93, 88, 113, 93, 88, 113, 93, 88, 113, 93, 88, 113, 93, 88, 113, 93, 88, 113, 93,
				89, 115, 95, 89, 113, 96, 93, 110, 95, 95, 110, 96, 93, 112, 94, 90, 113, 94, 86, 114, 96, 84, 115, 97, 92, 120, 101, 82, 105, 82, 33,
				60, 74, 22, 56, 84, 11, 51, 82, 13, 53, 89, 13, 48, 90, 16, 48, 92, 18, 50, 94, 16, 53, 93, 12, 55, 92, 9, 57, 93, 7, 56, 98, 9, 55,
				100, 13, 54, 94, 18, 53, 85, 18, 53, 84, 15, 53, 90, 14, 53, 93, 14, 53, 95, 14, 53, 93, 14, 53, 95, 14, 53, 93, 14, 53, 94, 14, 53,
				93, 14, 53, 94, 14, 53, 94, 14, 53, 94, 14, 53, 94, 14, 53, 94, 14, 53, 94, 14, 53, 93, 14, 53, 95, 14, 54, 95, 14, 56, 99, 14, 52,
				98, 18, 50, 100, 20, 51, 99, 19, 52, 95, 16, 53, 92, 13, 55, 93, 14, 57, 93, 12, 51, 78, 27, 58, 71, 39, 54, 91, 33, 55, 119, 28, 59,
				124, 31, 66, 133, 31, 63, 128, 33, 63, 125, 31, 62, 120, 26, 64, 117, 21, 67, 116, 17, 69, 119, 16, 68, 127, 17, 66, 132, 22, 64, 125,
				27, 64, 113, 27, 65, 111, 25, 65, 117, 24, 65, 120, 24, 64, 122, 24, 65, 120, 24, 64, 122, 24, 64, 120, 24, 64, 122, 24, 64, 121, 24,
				64, 121, 24, 64, 121, 24, 64, 121, 24, 64, 121, 24, 64, 121, 24, 64, 121, 24, 64, 121, 24, 64, 122, 24, 65, 120, 24, 66, 121, 22, 62,
				120, 26, 59, 125, 30, 60, 127, 30, 61, 121, 26, 61, 119, 23, 62, 124, 27, 64, 127, 27, 59, 111, 45, 67, 101, 44, 57, 101, 31, 53, 126,
				25, 55, 136, 26, 58, 139, 25, 55, 132, 25, 55, 127, 24, 57, 123, 21, 60, 121, 16, 63, 121, 13, 64, 125, 13, 62, 132, 15, 60, 137, 18,
				60, 131, 21, 61, 119, 20, 61, 116, 19, 61, 122, 18, 61, 126, 18, 61, 126, 18, 61, 126, 18, 61, 126, 18, 61, 126, 18, 61, 126, 18, 61,
				126, 18, 61, 126, 18, 61, 126, 18, 61, 126, 18, 61, 126, 18, 61, 126, 18, 61, 126, 18, 61, 126, 18, 61, 125, 18, 62, 124, 22, 63, 126,
				20, 59, 126, 21, 57, 130, 25, 59, 132, 25, 60, 127, 22, 59, 124, 19, 62, 129, 23, 65, 130, 25, 59, 116, 40, 62, 101, 36, 53, 91, 26,
				59, 116, 22, 60, 131, 19, 57, 132, 27, 57, 133, 28, 57, 130, 24, 59, 126, 20, 61, 124, 16, 62, 127, 15, 62, 131, 17, 61, 135, 19, 59,
				137, 19, 60, 130, 18, 62, 122, 17, 63, 120, 15, 63, 123, 14, 64, 125, 14, 64, 125, 14, 64, 125, 14, 64, 125, 14, 64, 125, 14, 64, 125,
				14, 64, 125, 14, 64, 125, 14, 64, 125, 14, 64, 125, 14, 64, 125, 14, 64, 125, 14, 64, 125, 14, 64, 125, 15, 63, 125, 19, 61, 125, 24,
				58, 125, 23, 57, 126, 20, 59, 127, 18, 60, 127, 20, 60, 123, 18, 62, 120, 11, 66, 118, 11, 68, 114, 15, 61, 101, 38, 64, 95, 45, 55,
				82, 36, 59, 100, 28, 54, 108, 26, 50, 112, 32, 51, 114, 33, 51, 112, 29, 52, 109, 27, 53, 108, 25, 53, 111, 25, 52, 115, 26, 51, 117,
				28, 51, 116, 27, 52, 112, 26, 54, 107, 25, 54, 106, 25, 54, 107, 25, 54, 108, 25, 54, 108, 25, 54, 108, 25, 54, 108, 25, 54, 108, 25,
				54, 108, 25, 54, 108, 25, 54, 108, 25, 54, 108, 25, 54, 108, 25, 54, 108, 25, 54, 108, 25, 54, 108, 25, 54, 108, 25, 54, 108, 29, 52,
				108, 36, 51, 112, 36, 51, 112, 30, 54, 112, 27, 56, 111, 29, 55, 108, 28, 56, 106, 21, 60, 102, 20, 62, 95, 25, 58, 86, 45, 62, 85,
				76, 64, 79, 76, 64, 91, 68, 56, 91, 69, 58, 98, 70, 59, 98, 68, 58, 95, 70, 61, 95, 70, 62, 96, 70, 61, 98, 70, 60, 101, 70, 60, 104,
				70, 60, 104, 70, 60, 101, 70, 61, 99, 72, 60, 98, 75, 59, 98, 76, 58, 98, 76, 58, 98, 76, 58, 98, 76, 58, 98, 76, 58, 98, 76, 58, 98,
				76, 58, 98, 77, 59, 98, 77, 59, 99, 77, 59, 99, 77, 59, 99, 77, 59, 99, 77, 59, 99, 77, 59, 99, 77, 59, 99, 78, 58, 100, 78, 56, 101,
				76, 56, 102, 70, 59, 102, 68, 61, 102, 70, 60, 100, 71, 59, 98, 68, 61, 95, 67, 63, 91, 67, 62, 85, 75, 64, 82, 118, 74, 80, 130, 74,
				89, 124, 65, 84, 128, 72, 92, 122, 73, 89, 119, 73, 86, 122, 73, 85, 125, 72, 86, 126, 71, 88, 126, 71, 91, 124, 71, 93, 123, 72, 94,
				124, 71, 93, 126, 70, 93, 129, 69, 92, 133, 67, 92, 134, 66, 91, 134, 66, 91, 134, 66, 91, 134, 66, 91, 134, 66, 91, 134, 66, 91, 134,
				66, 91, 134, 66, 91, 133, 66, 90, 133, 66, 90, 133, 66, 90, 133, 66, 90, 133, 66, 90, 133, 66, 90, 133, 66, 91, 132, 67, 93, 129, 67,
				94, 126, 69, 95, 121, 71, 95, 120, 71, 95, 124, 70, 96, 126, 68, 95, 127, 68, 95, 126, 69, 93, 122, 71, 90, 115, 71, 84, 156, 75, 76,
				177, 71, 78, 174, 62, 68, 177, 71, 73, 166, 74, 70, 162, 74, 68, 166, 71, 67, 171, 68, 67, 174, 66, 68, 174, 66, 70, 170, 68, 72, 167,
				69, 73, 168, 68, 75, 173, 65, 76, 175, 64, 76, 176, 64, 75, 176, 64, 74, 176, 64, 74, 176, 64, 74, 176, 64, 74, 176, 64, 74, 176, 64,
				74, 176, 64, 74, 176, 63, 74, 176, 63, 74, 176, 63, 74, 176, 63, 74, 176, 63, 74, 176, 63, 74, 176, 63, 74, 175, 64, 74, 173, 65, 75,
				170, 68, 77, 166, 70, 77, 163, 71, 78, 163, 71, 78, 166, 69, 80, 170, 67, 82, 175, 64, 82, 174, 64, 83, 168, 71, 85, 147, 72, 79, 176,
				69, 66, 203, 60, 61, 203, 52, 48, 203, 59, 49, 192, 67, 49, 187, 68, 50, 193, 63, 50, 200, 60, 50, 204, 58, 50, 204, 58, 51, 198, 60,
				52, 193, 62, 54, 196, 61, 56, 201, 57, 58, 203, 57, 59, 200, 58, 57, 200, 58, 57, 200, 58, 58, 200, 58, 57, 200, 58, 58, 200, 58, 57,
				200, 58, 57, 200, 58, 57, 200, 58, 58, 201, 59, 58, 201, 59, 58, 201, 59, 58, 201, 59, 58, 201, 59, 58, 201, 59, 58, 200, 59, 58, 197,
				61, 57, 193, 61, 55, 189, 63, 54, 188, 64, 56, 188, 64, 57, 190, 62, 60, 196, 58, 63, 204, 54, 64, 203, 53, 66, 194, 63, 73, 164, 65,
				67, 177, 65, 61, 207, 55, 51, 214, 52, 41, 209, 54, 37, 199, 65, 42, 194, 67, 44, 200, 60, 45, 207, 55, 45, 211, 53, 44, 211, 54, 43,
				204, 57, 43, 199, 60, 44, 201, 58, 46, 207, 54, 50, 209, 54, 50, 206, 55, 49, 204, 56, 48, 204, 56, 49, 204, 57, 48, 204, 56, 49, 204,
				56, 48, 204, 56, 49, 204, 56, 48, 205, 57, 49, 205, 57, 49, 205, 57, 49, 205, 57, 49, 205, 57, 49, 205, 57, 50, 205, 57, 49, 205, 57,
				50, 203, 59, 47, 201, 60, 43, 200, 60, 42, 200, 60, 44, 199, 60, 45, 201, 59, 47, 206, 55, 51, 216, 50, 53, 216, 49, 56, 203, 58, 62,
				169, 60, 57, 170, 64, 61, 202, 59, 52, 215, 62, 47, 204, 56, 37, 195, 67, 46, 188, 67, 48, 194, 61, 51, 202, 56, 52, 205, 55, 50, 204,
				56, 46, 198, 59, 44, 193, 62, 44, 195, 61, 46, 201, 57, 50, 202, 56, 51, 199, 58, 50, 197, 59, 48, 198, 59, 49, 197, 59, 48, 197, 59,
				49, 197, 59, 48, 197, 59, 49, 197, 59, 49, 197, 59, 49, 197, 59, 49, 197, 59, 49, 197, 59, 49, 197, 59, 49, 197, 59, 49, 197, 59, 49,
				198, 59, 49, 198, 60, 46, 199, 61, 42, 199, 61, 40, 201, 60, 41, 200, 60, 43, 199, 61, 45, 203, 58, 47, 213, 53, 50, 213, 52, 54, 202,
				60, 60, 168, 62, 55, 162, 65, 62, 191, 64, 57, 202, 68, 54, 192, 62, 45, 182, 69, 54, 176, 67, 57, 184, 64, 64, 191, 62, 66, 193, 61,
				62, 193, 62, 58, 188, 65, 54, 183, 68, 53, 185, 68, 55, 190, 65, 58, 191, 64, 59, 188, 66, 59, 187, 67, 58, 187, 65, 57, 186, 66, 57,
				187, 65, 57, 186, 66, 57, 187, 66, 58, 187, 67, 58, 187, 66, 57, 186, 65, 57, 186, 65, 57, 186, 65, 57, 186, 65, 57, 186, 65, 57, 186,
				65, 57, 187, 65, 56, 187, 65, 54, 187, 65, 50, 189, 65, 48, 190, 64, 48, 188, 65, 49, 185, 66, 51, 187, 65, 52, 196, 60, 54, 197, 59,
				57, 189, 67, 63, 158, 68, 58, 146, 65, 60, 167, 65, 56, 173, 65, 53, 170, 67, 54, 162, 69, 62, 158, 68, 69, 163, 65, 74, 167, 63, 75,
				168, 62, 71, 168, 64, 66, 164, 67, 61, 160, 70, 59, 162, 70, 59, 166, 69, 62, 167, 69, 64, 165, 70, 65, 164, 71, 65, 163, 69, 64, 162,
				68, 63, 162, 67, 62, 162, 68, 63, 162, 68, 63, 162, 68, 63, 162, 68, 63, 162, 68, 62, 162, 68, 62, 162, 68, 62, 162, 68, 62, 162, 67,
				62, 162, 68, 62, 162, 67, 62, 163, 67, 61, 164, 69, 59, 166, 68, 58, 167, 68, 57, 164, 69, 58, 158, 72, 59, 158, 72, 59, 165, 68, 60,
				168, 67, 62, 162, 73, 66, 139, 73, 61,
			]
		),
	},
	{
		c: "ch",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				125, 21, 40, 145, 17, 36, 145, 22, 32, 140, 19, 23, 148, 22, 26, 151, 17, 25, 156, 12, 28, 156, 11, 32, 149, 14, 35, 143, 17, 36, 144,
				16, 36, 147, 15, 35, 147, 15, 33, 146, 16, 31, 145, 17, 30, 146, 18, 30, 150, 17, 31, 155, 12, 31, 166, 15, 37, 166, 6, 33, 175, 12,
				42, 169, 6, 36, 166, 7, 37, 161, 10, 38, 160, 18, 42, 152, 18, 38, 146, 17, 35, 148, 22, 37, 147, 21, 34, 146, 18, 31, 152, 20, 34,
				153, 18, 34, 155, 16, 37, 156, 15, 37, 157, 15, 38, 156, 17, 38, 153, 19, 38, 153, 18, 39, 155, 16, 39, 152, 17, 40, 142, 24, 44, 114,
				25, 38, 148, 19, 40, 174, 14, 37, 174, 16, 29, 172, 14, 21, 177, 18, 24, 180, 14, 23, 184, 10, 25, 184, 8, 29, 177, 11, 33, 171, 13,
				35, 174, 12, 34, 178, 10, 33, 178, 11, 30, 176, 13, 27, 174, 13, 24, 171, 9, 20, 180, 13, 25, 185, 11, 27, 196, 14, 34, 195, 7, 31,
				198, 9, 34, 195, 7, 33, 190, 8, 32, 182, 8, 30, 180, 13, 32, 177, 16, 31, 174, 15, 28, 176, 16, 27, 178, 13, 24, 183, 13, 23, 188, 13,
				24, 187, 8, 24, 189, 6, 32, 189, 5, 34, 190, 6, 35, 188, 8, 35, 183, 10, 36, 181, 10, 36, 184, 8, 37, 179, 10, 39, 167, 21, 46, 133,
				23, 40, 157, 19, 41, 187, 10, 35, 186, 8, 23, 186, 7, 15, 188, 10, 16, 190, 7, 16, 194, 4, 19, 194, 3, 23, 187, 5, 27, 183, 7, 29,
				187, 6, 29, 192, 3, 26, 191, 4, 23, 188, 7, 20, 186, 8, 18, 185, 7, 16, 188, 10, 19, 179, 1, 11, 192, 14, 26, 186, 11, 24, 182, 9, 22,
				186, 15, 28, 187, 20, 32, 184, 18, 29, 177, 12, 22, 179, 11, 21, 184, 11, 20, 185, 6, 14, 191, 5, 12, 199, 6, 14, 203, 5, 14, 199, 0,
				12, 199, 0, 23, 198, 0, 26, 199, 0, 26, 197, 1, 26, 191, 3, 28, 189, 3, 28, 192, 2, 31, 187, 3, 33, 177, 18, 44, 141, 23, 40, 161, 18,
				43, 196, 6, 35, 195, 2, 21, 196, 3, 15, 197, 5, 14, 197, 4, 15, 200, 1, 17, 199, 0, 21, 194, 2, 26, 192, 4, 28, 196, 2, 28, 201, 0,
				24, 201, 1, 21, 197, 4, 19, 195, 7, 19, 197, 11, 24, 195, 16, 30, 170, 8, 16, 210, 67, 74, 203, 75, 77, 192, 70, 71, 195, 74, 74, 200,
				77, 79, 198, 62, 68, 177, 25, 34, 179, 11, 24, 191, 10, 24, 192, 0, 15, 198, 0, 14, 204, 2, 15, 205, 2, 14, 199, 1, 12, 200, 1, 18,
				199, 0, 20, 201, 0, 20, 199, 0, 20, 193, 1, 22, 192, 1, 24, 196, 0, 27, 192, 1, 31, 180, 15, 41, 144, 21, 38, 160, 15, 42, 198, 2, 36,
				197, 0, 21, 200, 0, 18, 199, 2, 16, 198, 1, 16, 201, 0, 18, 201, 0, 22, 196, 0, 25, 194, 0, 27, 199, 0, 27, 205, 0, 24, 204, 0, 21,
				200, 1, 19, 196, 2, 20, 191, 5, 25, 191, 20, 42, 162, 26, 37, 252, 169, 171, 255, 200, 194, 252, 203, 194, 252, 199, 190, 254, 199,
				193, 232, 141, 144, 181, 52, 63, 179, 19, 37, 198, 13, 37, 198, 0, 26, 202, 0, 25, 200, 1, 22, 197, 2, 20, 194, 2, 18, 196, 2, 19,
				198, 1, 19, 199, 0, 19, 198, 1, 19, 192, 3, 20, 192, 3, 24, 198, 1, 27, 194, 1, 30, 180, 12, 37, 144, 17, 35, 165, 16, 44, 202, 2, 36,
				200, 0, 24, 202, 0, 20, 199, 0, 20, 197, 0, 19, 200, 0, 19, 201, 0, 21, 198, 0, 23, 197, 0, 25, 201, 0, 25, 206, 0, 23, 206, 0, 21,
				201, 0, 20, 200, 3, 24, 205, 11, 37, 195, 28, 49, 150, 27, 37, 252, 209, 208, 255, 243, 236, 254, 250, 241, 255, 242, 234, 255, 241,
				237, 246, 179, 181, 189, 70, 79, 180, 25, 40, 201, 18, 39, 200, 2, 28, 201, 1, 26, 197, 0, 22, 192, 0, 19, 193, 1, 19, 194, 2, 18,
				196, 1, 19, 198, 0, 21, 196, 0, 20, 191, 1, 19, 191, 2, 21, 196, 1, 25, 192, 1, 28, 179, 11, 34, 144, 17, 31, 169, 14, 39, 205, 0, 31,
				198, 0, 24, 195, 0, 21, 195, 1, 26, 194, 0, 26, 196, 0, 21, 196, 0, 17, 197, 2, 17, 199, 3, 18, 199, 1, 17, 201, 0, 17, 202, 0, 19,
				196, 0, 16, 195, 1, 16, 201, 9, 26, 192, 26, 38, 150, 30, 33, 252, 207, 204, 255, 245, 241, 252, 247, 246, 254, 248, 250, 255, 243,
				246, 240, 174, 175, 185, 66, 67, 181, 27, 32, 205, 25, 35, 197, 8, 20, 193, 1, 16, 199, 1, 21, 196, 1, 17, 199, 3, 21, 195, 2, 19,
				198, 2, 22, 201, 0, 28, 197, 0, 26, 193, 0, 21, 193, 1, 22, 196, 0, 26, 190, 3, 28, 179, 15, 33, 145, 20, 29, 170, 14, 37, 205, 1, 28,
				198, 0, 22, 195, 0, 23, 195, 0, 29, 194, 0, 29, 197, 1, 24, 196, 1, 16, 195, 0, 10, 195, 0, 9, 195, 0, 13, 198, 2, 20, 199, 5, 23,
				193, 3, 19, 193, 4, 19, 203, 15, 29, 204, 41, 50, 157, 40, 41, 252, 221, 219, 255, 247, 247, 252, 250, 254, 254, 245, 254, 255, 239,
				248, 248, 179, 184, 194, 73, 74, 183, 29, 31, 199, 23, 28, 189, 5, 15, 190, 3, 20, 200, 7, 28, 199, 3, 22, 197, 1, 19, 195, 2, 19,
				198, 2, 24, 201, 0, 32, 199, 0, 28, 196, 0, 22, 194, 2, 21, 195, 2, 25, 188, 4, 27, 179, 16, 32, 145, 21, 28, 167, 14, 36, 203, 1, 27,
				200, 0, 22, 197, 0, 23, 198, 0, 29, 197, 0, 28, 201, 1, 24, 201, 0, 18, 204, 1, 16, 203, 1, 16, 201, 5, 22, 201, 13, 34, 197, 17, 37,
				191, 16, 33, 194, 17, 35, 197, 17, 38, 194, 35, 51, 138, 24, 29, 251, 212, 212, 255, 236, 238, 252, 246, 251, 254, 245, 255, 255, 241,
				252, 244, 173, 182, 185, 62, 70, 178, 24, 33, 200, 27, 39, 197, 17, 34, 198, 18, 40, 198, 16, 38, 196, 12, 32, 194, 6, 23, 193, 4, 19,
				198, 2, 22, 202, 0, 31, 200, 0, 29, 197, 0, 23, 195, 3, 22, 196, 3, 26, 189, 5, 28, 178, 16, 32, 144, 20, 28, 165, 14, 35, 201, 1, 27,
				201, 0, 20, 201, 0, 22, 199, 0, 27, 198, 0, 27, 199, 0, 21, 202, 0, 16, 206, 2, 18, 197, 1, 14, 185, 5, 18, 179, 13, 31, 168, 14, 31,
				158, 11, 26, 165, 19, 36, 177, 27, 47, 172, 41, 54, 130, 38, 41, 251, 223, 220, 255, 249, 247, 249, 253, 253, 249, 245, 251, 253, 241,
				247, 240, 181, 187, 177, 76, 82, 163, 35, 43, 176, 33, 44, 168, 19, 34, 162, 12, 32, 158, 6, 24, 169, 11, 27, 175, 5, 19, 188, 5, 18,
				198, 2, 22, 202, 0, 31, 200, 0, 28, 197, 0, 21, 195, 3, 20, 196, 3, 25, 189, 5, 27, 178, 16, 30, 145, 20, 27, 162, 15, 33, 199, 1, 24,
				203, 0, 19, 203, 0, 20, 200, 0, 27, 198, 0, 27, 198, 0, 19, 199, 0, 15, 202, 3, 19, 190, 2, 18, 187, 23, 38, 198, 61, 77, 194, 77, 89,
				183, 77, 86, 183, 82, 94, 174, 77, 89, 169, 88, 95, 144, 93, 89, 245, 228, 218, 246, 252, 247, 233, 255, 251, 239, 253, 253, 250, 252,
				251, 220, 192, 190, 165, 107, 105, 161, 82, 82, 176, 85, 89, 173, 78, 86, 175, 77, 88, 177, 73, 84, 188, 71, 79, 173, 33, 40, 182, 8,
				20, 198, 3, 21, 202, 0, 29, 201, 0, 28, 197, 1, 22, 197, 3, 21, 198, 3, 25, 191, 4, 27, 180, 15, 30, 146, 20, 26, 159, 16, 32, 196, 2,
				23, 204, 0, 18, 205, 0, 19, 200, 1, 25, 196, 0, 25, 198, 2, 21, 197, 2, 18, 198, 4, 20, 188, 10, 25, 204, 61, 74, 238, 142, 151, 243,
				181, 187, 240, 187, 190, 240, 194, 200, 237, 197, 205, 236, 203, 207, 224, 200, 193, 252, 249, 237, 239, 255, 245, 226, 254, 245, 235,
				255, 253, 243, 254, 252, 243, 237, 231, 229, 201, 194, 230, 195, 190, 238, 199, 196, 237, 192, 194, 238, 191, 198, 239, 182, 188, 229,
				150, 155, 180, 56, 61, 177, 9, 19, 197, 2, 20, 202, 0, 29, 200, 0, 27, 198, 1, 21, 197, 4, 20, 198, 4, 24, 191, 5, 25, 180, 15, 28,
				146, 20, 25, 157, 16, 32, 193, 3, 23, 203, 0, 17, 205, 0, 19, 199, 1, 25, 193, 2, 24, 193, 3, 20, 190, 2, 16, 189, 4, 18, 175, 10, 24,
				197, 76, 85, 244, 182, 185, 255, 235, 234, 255, 240, 236, 255, 241, 242, 255, 238, 243, 255, 243, 247, 252, 245, 239, 255, 254, 244,
				246, 253, 245, 240, 254, 248, 245, 255, 253, 246, 252, 251, 252, 250, 245, 253, 243, 235, 253, 242, 235, 255, 240, 236, 255, 235, 236,
				255, 235, 241, 255, 229, 237, 240, 188, 195, 186, 63, 71, 175, 7, 18, 196, 1, 18, 201, 0, 27, 200, 0, 26, 198, 1, 20, 197, 4, 19, 198,
				3, 23, 190, 4, 24, 180, 15, 28, 146, 20, 24, 155, 17, 31, 192, 4, 23, 202, 0, 16, 205, 0, 18, 198, 2, 25, 190, 3, 23, 188, 2, 17, 187,
				3, 16, 188, 8, 23, 171, 12, 25, 188, 78, 86, 238, 190, 191, 253, 246, 241, 249, 248, 242, 248, 249, 247, 254, 249, 251, 251, 245, 249,
				255, 253, 247, 255, 253, 245, 253, 251, 246, 252, 254, 251, 249, 251, 252, 250, 251, 251, 250, 248, 244, 253, 249, 242, 253, 250, 242,
				253, 249, 244, 255, 247, 248, 255, 240, 248, 255, 232, 243, 240, 193, 204, 185, 61, 72, 175, 6, 17, 196, 0, 17, 201, 0, 27, 200, 0,
				26, 198, 0, 19, 196, 3, 18, 197, 3, 22, 190, 4, 23, 180, 15, 26, 146, 20, 24, 154, 17, 32, 190, 4, 22, 202, 0, 17, 204, 0, 17, 196, 1,
				24, 191, 3, 23, 188, 1, 17, 190, 5, 18, 189, 7, 23, 171, 10, 25, 189, 78, 87, 238, 188, 190, 254, 243, 240, 251, 246, 242, 250, 251,
				250, 252, 251, 254, 251, 249, 251, 255, 251, 246, 255, 254, 244, 251, 251, 245, 254, 254, 252, 249, 251, 252, 252, 253, 253, 250, 249,
				245, 252, 251, 243, 250, 252, 243, 250, 252, 245, 255, 252, 251, 255, 242, 248, 255, 231, 240, 240, 196, 205, 184, 62, 71, 174, 7, 17,
				195, 0, 16, 200, 0, 24, 200, 0, 25, 198, 1, 19, 195, 2, 16, 196, 1, 21, 189, 3, 22, 178, 14, 24, 144, 18, 20, 154, 18, 32, 189, 4, 22,
				202, 0, 17, 203, 0, 17, 196, 0, 23, 194, 3, 25, 194, 3, 21, 196, 5, 20, 191, 3, 19, 178, 8, 25, 203, 77, 90, 246, 184, 191, 255, 236,
				238, 255, 238, 239, 254, 245, 247, 253, 247, 252, 254, 245, 248, 254, 242, 236, 255, 253, 244, 252, 253, 247, 250, 251, 249, 250, 252,
				253, 253, 253, 254, 253, 248, 244, 254, 247, 238, 252, 249, 240, 252, 247, 242, 255, 243, 244, 255, 237, 243, 255, 229, 237, 241, 193,
				201, 187, 62, 71, 176, 8, 18, 195, 0, 16, 199, 0, 23, 200, 0, 24, 198, 0, 18, 195, 2, 16, 196, 1, 20, 190, 4, 22, 179, 14, 24, 148,
				21, 22, 154, 18, 32, 189, 4, 22, 200, 0, 18, 203, 0, 18, 198, 0, 23, 197, 2, 26, 199, 2, 21, 200, 2, 18, 199, 1, 17, 189, 5, 23, 206,
				57, 74, 237, 139, 152, 241, 179, 190, 235, 179, 188, 232, 183, 193, 229, 186, 197, 225, 185, 193, 222, 188, 186, 254, 240, 233, 255,
				252, 249, 249, 248, 246, 253, 250, 253, 255, 250, 253, 247, 226, 226, 228, 195, 192, 225, 189, 186, 231, 190, 191, 231, 184, 190, 233,
				181, 192, 236, 175, 187, 230, 147, 157, 185, 50, 60, 179, 8, 19, 195, 0, 17, 199, 0, 24, 200, 0, 25, 197, 0, 18, 195, 2, 16, 197, 2,
				20, 191, 5, 22, 182, 16, 26, 156, 28, 29, 155, 18, 33, 190, 3, 22, 199, 0, 19, 202, 0, 19, 198, 0, 24, 199, 0, 26, 201, 0, 20, 205, 0,
				17, 210, 0, 19, 201, 0, 21, 194, 21, 42, 201, 58, 79, 200, 78, 97, 190, 80, 97, 187, 84, 102, 182, 84, 103, 177, 94, 107, 164, 102,
				104, 252, 223, 219, 255, 246, 245, 252, 247, 249, 254, 246, 251, 255, 245, 252, 233, 192, 197, 179, 112, 115, 168, 86, 90, 183, 92,
				99, 184, 88, 100, 186, 84, 101, 190, 78, 94, 194, 66, 80, 177, 27, 39, 184, 7, 20, 195, 1, 19, 200, 0, 26, 200, 0, 26, 197, 0, 19,
				195, 2, 16, 197, 3, 21, 192, 6, 23, 182, 17, 25, 160, 32, 32, 157, 18, 34, 193, 2, 23, 199, 0, 20, 200, 0, 21, 197, 0, 25, 199, 0, 27,
				203, 0, 22, 208, 0, 18, 215, 1, 21, 210, 1, 21, 194, 2, 25, 182, 10, 36, 174, 17, 42, 168, 18, 40, 168, 24, 46, 169, 30, 53, 164, 44,
				60, 133, 46, 49, 251, 219, 217, 255, 241, 239, 255, 249, 251, 255, 243, 250, 255, 241, 250, 233, 176, 184, 163, 67, 75, 148, 31, 40,
				167, 37, 49, 164, 28, 44, 162, 24, 44, 163, 20, 40, 168, 17, 33, 179, 14, 27, 189, 7, 20, 195, 2, 20, 200, 0, 26, 199, 0, 25, 197, 0,
				19, 195, 2, 17, 198, 3, 21, 193, 7, 24, 181, 16, 23, 159, 32, 30, 162, 16, 36, 196, 1, 25, 199, 0, 22, 198, 0, 22, 195, 0, 26, 196, 0,
				28, 200, 0, 23, 202, 0, 15, 207, 0, 14, 210, 0, 18, 204, 1, 25, 198, 7, 33, 196, 13, 39, 189, 11, 35, 187, 13, 36, 196, 25, 49, 182,
				33, 50, 139, 31, 35, 251, 219, 216, 255, 240, 238, 255, 249, 251, 255, 245, 252, 255, 241, 250, 245, 177, 186, 186, 70, 78, 180, 36,
				45, 197, 36, 48, 184, 16, 33, 183, 15, 36, 187, 18, 38, 185, 11, 28, 190, 10, 25, 193, 6, 21, 196, 3, 22, 200, 0, 27, 199, 0, 26, 197,
				0, 19, 195, 2, 18, 198, 3, 22, 194, 7, 24, 181, 16, 23, 159, 32, 29, 167, 14, 36, 200, 0, 25, 198, 0, 23, 195, 0, 24, 191, 0, 27, 192,
				1, 28, 194, 2, 22, 196, 2, 15, 197, 1, 10, 203, 2, 14, 204, 2, 21, 203, 4, 27, 204, 9, 33, 198, 7, 28, 196, 7, 27, 204, 17, 37, 187,
				24, 38, 149, 31, 32, 252, 214, 210, 255, 242, 241, 253, 248, 249, 255, 249, 254, 255, 242, 249, 245, 174, 179, 189, 64, 69, 185, 29,
				35, 203, 25, 35, 188, 4, 18, 188, 4, 22, 195, 9, 28, 192, 2, 20, 192, 2, 18, 193, 4, 20, 195, 2, 23, 200, 0, 29, 199, 0, 26, 197, 0,
				21, 195, 2, 18, 198, 3, 21, 194, 7, 23, 183, 17, 23, 160, 33, 29, 171, 13, 37, 202, 0, 25, 197, 1, 23, 192, 2, 24, 187, 2, 27, 187, 4,
				29, 190, 6, 24, 196, 9, 22, 195, 6, 16, 198, 6, 16, 197, 5, 17, 194, 0, 16, 197, 1, 19, 194, 1, 16, 194, 3, 16, 202, 12, 26, 190, 24,
				32, 156, 36, 35, 252, 218, 213, 255, 242, 239, 254, 250, 250, 255, 249, 253, 255, 241, 245, 249, 178, 179, 192, 68, 67, 183, 26, 26,
				202, 24, 28, 195, 6, 16, 195, 3, 19, 199, 5, 22, 201, 4, 21, 203, 7, 23, 194, 3, 19, 195, 2, 23, 200, 0, 28, 200, 0, 27, 197, 0, 21,
				195, 2, 18, 197, 2, 21, 193, 6, 23, 183, 17, 23, 159, 32, 29, 171, 13, 38, 204, 0, 29, 197, 0, 24, 193, 2, 25, 188, 2, 26, 187, 4, 27,
				189, 2, 21, 195, 6, 21, 191, 3, 16, 191, 4, 16, 194, 4, 17, 196, 2, 17, 201, 4, 22, 200, 4, 20, 197, 5, 18, 197, 11, 23, 191, 28, 34,
				159, 33, 32, 252, 214, 211, 255, 225, 223, 255, 240, 239, 255, 239, 241, 255, 235, 236, 251, 171, 170, 197, 66, 65, 185, 25, 26, 202,
				23, 27, 196, 8, 16, 196, 4, 18, 198, 2, 18, 197, 1, 15, 194, 0, 13, 195, 2, 19, 194, 1, 22, 198, 0, 25, 198, 0, 25, 194, 1, 19, 194,
				2, 18, 198, 2, 21, 195, 5, 23, 182, 14, 23, 157, 29, 27, 168, 15, 43, 205, 0, 37, 191, 0, 18, 203, 7, 30, 195, 7, 28, 194, 5, 25, 198,
				1, 23, 201, 0, 21, 197, 2, 21, 193, 4, 20, 194, 3, 20, 197, 1, 20, 198, 1, 19, 197, 1, 18, 191, 3, 18, 187, 11, 24, 188, 28, 36, 168,
				29, 32, 250, 167, 168, 252, 199, 197, 252, 200, 197, 252, 200, 197, 252, 202, 200, 247, 142, 142, 201, 55, 58, 184, 21, 27, 194, 17,
				26, 195, 9, 21, 198, 8, 23, 192, 1, 15, 189, 0, 12, 194, 2, 17, 198, 6, 21, 197, 5, 20, 197, 2, 19, 193, 0, 17, 190, 1, 15, 191, 1,
				16, 199, 1, 19, 199, 4, 23, 186, 11, 25, 161, 29, 33, 167, 18, 44, 206, 4, 41, 193, 0, 24, 198, 2, 26, 190, 1, 21, 189, 0, 17, 199, 0,
				20, 203, 0, 22, 196, 1, 22, 190, 3, 22, 191, 3, 22, 195, 1, 21, 196, 0, 19, 194, 1, 18, 189, 2, 19, 184, 5, 24, 187, 20, 36, 164, 8,
				18, 188, 43, 51, 176, 42, 46, 176, 45, 48, 175, 44, 45, 172, 36, 39, 185, 37, 43, 173, 16, 23, 176, 7, 17, 186, 7, 20, 185, 0, 13,
				191, 1, 16, 197, 2, 19, 196, 2, 18, 195, 0, 17, 199, 2, 20, 199, 2, 19, 200, 2, 19, 197, 2, 18, 192, 3, 17, 193, 3, 18, 200, 2, 22,
				200, 4, 26, 188, 11, 29, 162, 30, 37, 162, 11, 38, 199, 3, 39, 193, 0, 29, 192, 2, 25, 192, 6, 24, 193, 5, 24, 199, 1, 24, 201, 0, 25,
				194, 3, 26, 189, 6, 25, 190, 5, 24, 194, 4, 23, 195, 4, 22, 195, 3, 22, 194, 2, 23, 194, 0, 26, 192, 3, 28, 190, 10, 32, 177, 9, 27,
				171, 11, 26, 171, 17, 30, 170, 17, 29, 176, 18, 31, 179, 11, 28, 181, 4, 23, 193, 6, 29, 201, 5, 31, 198, 0, 25, 200, 1, 25, 206, 4,
				29, 203, 2, 27, 200, 0, 22, 204, 0, 23, 204, 0, 23, 206, 0, 24, 203, 0, 23, 197, 1, 23, 196, 3, 23, 200, 2, 26, 198, 4, 29, 185, 11,
				31, 161, 28, 38, 153, 24, 41, 181, 14, 40, 176, 12, 32, 168, 7, 22, 172, 12, 24, 175, 11, 24, 179, 8, 25, 179, 7, 25, 173, 10, 26,
				168, 14, 26, 170, 13, 26, 175, 10, 25, 176, 10, 23, 175, 9, 23, 179, 8, 25, 184, 6, 29, 173, 1, 21, 180, 12, 34, 174, 15, 34, 174, 24,
				40, 169, 24, 38, 164, 19, 33, 171, 23, 39, 174, 18, 36, 177, 13, 34, 179, 8, 31, 183, 6, 31, 187, 8, 33, 186, 5, 31, 184, 4, 29, 179,
				2, 25, 180, 4, 26, 182, 5, 27, 184, 6, 26, 187, 6, 27, 184, 7, 27, 177, 9, 27, 174, 10, 26, 178, 9, 28, 176, 10, 30, 167, 17, 33, 148,
				33, 40, 135, 46, 51, 155, 39, 47, 153, 42, 45, 143, 34, 33, 150, 39, 38, 153, 38, 38, 156, 35, 39, 156, 36, 40, 150, 39, 41, 145, 42,
				41, 149, 40, 40, 154, 38, 39, 154, 38, 38, 153, 38, 38, 158, 36, 41, 168, 36, 49, 166, 34, 48, 160, 35, 47, 152, 36, 45, 147, 39, 46,
				146, 42, 48, 144, 41, 46, 144, 38, 44, 147, 35, 43, 152, 34, 44, 147, 25, 37, 149, 25, 37, 158, 33, 45, 156, 31, 43, 153, 29, 42, 149,
				29, 41, 152, 39, 47, 151, 44, 50, 152, 44, 50, 156, 44, 50, 154, 45, 50, 149, 45, 48, 148, 45, 47, 153, 42, 48, 154, 42, 49, 147, 42,
				48, 132, 50, 51,
			]
		),
	},
	{
		c: "de",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				28, 33, 26, 38, 26, 30, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29,
				37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29,
				37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29,
				37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 29, 34, 27, 39, 27, 31,
				37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29,
				37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29,
				37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29,
				37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 37, 28, 29, 31, 33, 30, 37, 27, 35, 38, 28, 26, 38, 28, 26,
				38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26,
				38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26,
				38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26,
				38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 32, 34, 31, 37, 27, 35, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26,
				38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26,
				38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26,
				38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26, 38, 28, 26,
				38, 28, 26, 38, 28, 26, 38, 28, 26, 34, 33, 31, 32, 30, 35, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27,
				37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27,
				37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27,
				37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27,
				37, 29, 27, 34, 33, 31, 32, 30, 35, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27,
				37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27,
				37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27,
				37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 37, 29, 27, 48, 28, 17,
				45, 26, 20, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24,
				35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24,
				35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24,
				35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 48, 28, 17, 44, 25, 19, 35, 30, 24,
				35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24,
				35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24,
				35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24,
				35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 35, 30, 24, 85, 17, 0, 83, 10, 0, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10,
				1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1,
				83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1,
				83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1, 83, 10, 1,
				137, 69, 48, 153, 80, 65, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151,
				78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78,
				69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69,
				151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151, 78, 69, 151,
				78, 69, 186, 61, 39, 201, 64, 48, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58,
				41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41,
				203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203,
				58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58, 41, 203, 58,
				41, 203, 58, 41, 190, 65, 43, 195, 58, 42, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40,
				202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202,
				57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57,
				40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40, 202, 57, 40,
				202, 57, 40, 202, 57, 40, 212, 65, 45, 210, 54, 39, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201,
				61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61,
				34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34,
				201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201, 61, 34, 201,
				61, 34, 201, 61, 34, 201, 61, 34, 204, 57, 37, 203, 47, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59,
				32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32,
				199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199,
				59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 199, 59,
				32, 199, 59, 32, 199, 59, 32, 199, 59, 32, 201, 65, 41, 203, 64, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43,
				200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200,
				60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60,
				43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43,
				200, 60, 43, 200, 60, 43, 200, 60, 43, 200, 60, 43, 197, 61, 37, 197, 58, 37, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199,
				59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59,
				42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42,
				199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199,
				59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 199, 59, 42, 194, 53, 35, 199, 69, 35, 200, 60, 37, 200, 60, 37, 200, 60, 37, 200, 60,
				37, 200, 60, 37, 200, 60, 37, 200, 60, 37, 200, 60, 37, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39,
				199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199,
				60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60,
				39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 199, 60, 39, 198, 57, 39, 191, 61, 27, 199, 59, 36, 199, 59, 36, 199, 59, 36,
				199, 59, 36, 199, 59, 36, 199, 59, 36, 199, 59, 36, 199, 59, 36, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198,
				59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59,
				38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38,
				198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 198, 59, 38, 189, 92, 15, 168, 84, 0, 173, 83, 0, 173, 83, 0, 173,
				83, 0, 173, 83, 0, 173, 83, 0, 173, 83, 0, 173, 83, 0, 173, 83, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172,
				84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172,
				84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172,
				84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 172, 84, 0, 255, 173, 96, 255, 186, 96, 255, 183, 97, 255, 183, 97, 255, 183, 97, 255, 183,
				97, 255, 183, 97, 255, 183, 97, 255, 183, 97, 255, 183, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255,
				184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97,
				255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255,
				184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 255, 184, 97, 250, 199, 56, 242, 207, 53,
				241, 207, 48, 241, 207, 48, 241, 207, 48, 241, 207, 48, 241, 207, 48, 241, 207, 48, 241, 207, 48, 241, 207, 48, 240, 208, 48, 240,
				208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48,
				240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240,
				208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48, 240, 208, 48,
				240, 208, 48, 240, 208, 48, 254, 203, 60, 242, 207, 53, 243, 209, 50, 243, 209, 50, 243, 209, 50, 243, 209, 50, 243, 209, 50, 243,
				209, 50, 243, 209, 50, 243, 209, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50,
				242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242,
				210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50,
				242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 242, 210, 50, 244, 213, 47, 236, 212, 54, 238, 208, 48, 238,
				208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48,
				238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238,
				208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48,
				238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238, 208, 48, 238,
				208, 48, 240, 209, 43, 235, 211, 53, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49,
				239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239,
				209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49,
				239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239,
				209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 239, 209, 49, 237, 211, 36, 243, 210, 37, 243, 209, 49, 243, 209, 49, 242, 208, 48,
				241, 207, 47, 241, 207, 47, 241, 207, 47, 242, 208, 48, 242, 208, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241,
				209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 242, 210, 49, 242, 210, 49, 242, 210, 49, 242, 210, 49,
				241, 209, 48, 241, 209, 48, 240, 208, 47, 241, 209, 48, 241, 209, 48, 241, 209, 48, 240, 208, 47, 240, 208, 47, 241, 209, 48, 242,
				210, 49, 242, 210, 49, 242, 210, 49, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 238, 212, 37,
				243, 210, 37, 243, 209, 49, 242, 208, 48, 242, 208, 48, 242, 208, 48, 242, 208, 48, 242, 208, 48, 242, 208, 48, 242, 208, 48, 241,
				209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48,
				241, 209, 48, 242, 210, 49, 242, 210, 49, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241,
				209, 48, 240, 208, 47, 240, 208, 47, 241, 209, 48, 242, 210, 49, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48,
				241, 209, 48, 241, 209, 48, 241, 209, 48, 229, 213, 65, 238, 209, 56, 240, 208, 47, 240, 208, 47, 240, 208, 47, 241, 209, 48, 241,
				209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48,
				241, 209, 48, 241, 209, 48, 240, 208, 47, 240, 208, 47, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 240, 208, 47, 240,
				208, 47, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 240, 208, 47, 240, 208, 47, 241, 209, 48, 241, 209, 48, 240, 208, 47,
				240, 208, 47, 240, 208, 47, 240, 208, 47, 241, 209, 48, 241, 209, 48, 241, 209, 48, 241, 209, 48, 226, 210, 62, 240, 211, 58, 240,
				208, 47, 240, 208, 47, 241, 209, 48, 242, 210, 49, 242, 210, 49, 242, 210, 49, 241, 209, 48, 241, 209, 48, 242, 210, 49, 242, 210, 49,
				242, 210, 49, 242, 210, 49, 242, 210, 49, 242, 210, 49, 242, 210, 49, 242, 210, 49, 241, 209, 48, 241, 209, 48, 242, 210, 49, 242,
				210, 49, 242, 210, 49, 242, 210, 49, 242, 210, 49, 242, 210, 49, 242, 210, 49, 242, 210, 49, 242, 210, 49, 242, 210, 49, 241, 209, 48,
				241, 209, 48, 241, 209, 48, 242, 210, 49, 242, 210, 49, 242, 210, 49, 242, 210, 49, 242, 210, 49, 242, 210, 49, 242, 210, 49, 242,
				210, 49, 242, 210, 49,
			]
		),
	},
	{
		c: "dk",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				136, 104, 77, 169, 87, 72, 153, 88, 72, 160, 84, 70, 162, 83, 70, 162, 85, 71, 161, 83, 69, 159, 81, 69, 157, 80, 68, 156, 81, 70,
				155, 83, 70, 145, 95, 76, 177, 144, 119, 195, 192, 157, 189, 198, 161, 187, 179, 145, 147, 129, 98, 128, 96, 67, 148, 89, 67, 156, 86,
				67, 160, 88, 69, 158, 87, 68, 167, 86, 68, 175, 82, 70, 177, 81, 70, 177, 81, 69, 179, 84, 68, 179, 84, 68, 179, 84, 68, 179, 84, 68,
				178, 83, 67, 175, 82, 68, 173, 81, 68, 173, 80, 66, 172, 84, 69, 174, 84, 70, 175, 85, 71, 175, 87, 73, 170, 87, 72, 184, 83, 71, 185,
				82, 71, 174, 85, 71, 144, 99, 74, 184, 80, 70, 170, 79, 71, 179, 74, 70, 180, 71, 68, 180, 72, 69, 179, 71, 68, 178, 70, 69, 177, 69,
				69, 177, 72, 71, 173, 70, 68, 164, 87, 78, 223, 167, 152, 250, 238, 214, 249, 245, 216, 243, 216, 191, 192, 152, 129, 147, 88, 69,
				171, 81, 68, 183, 80, 71, 185, 78, 70, 181, 77, 68, 190, 74, 68, 193, 72, 69, 194, 71, 69, 194, 71, 67, 194, 72, 65, 194, 72, 65, 194,
				72, 65, 194, 72, 65, 194, 72, 65, 191, 72, 66, 190, 73, 67, 188, 73, 66, 187, 74, 65, 188, 73, 64, 188, 73, 64, 187, 74, 65, 182, 76,
				64, 200, 71, 64, 202, 71, 65, 190, 77, 67, 152, 98, 74, 184, 80, 71, 182, 75, 74, 188, 69, 74, 188, 64, 71, 188, 64, 71, 188, 64, 71,
				187, 63, 70, 187, 63, 70, 189, 65, 72, 181, 60, 66, 188, 88, 88, 243, 163, 157, 251, 213, 195, 233, 217, 193, 233, 187, 169, 200, 137,
				123, 178, 92, 83, 192, 78, 76, 203, 79, 79, 200, 72, 73, 194, 69, 69, 201, 66, 69, 194, 68, 68, 190, 67, 67, 189, 67, 64, 189, 67, 64,
				189, 67, 64, 189, 67, 64, 189, 67, 64, 189, 67, 64, 187, 67, 64, 185, 68, 64, 185, 69, 63, 182, 69, 62, 184, 69, 59, 184, 69, 58, 182,
				69, 58, 177, 71, 56, 196, 66, 56, 199, 67, 59, 188, 75, 64, 153, 98, 74, 184, 80, 71, 189, 73, 72, 193, 68, 73, 193, 64, 72, 192, 64,
				71, 192, 64, 72, 190, 62, 70, 190, 62, 70, 193, 63, 71, 186, 58, 65, 194, 87, 89, 252, 165, 161, 255, 228, 216, 255, 233, 213, 247,
				198, 184, 207, 140, 129, 185, 97, 92, 202, 81, 83, 211, 81, 85, 206, 73, 77, 202, 70, 74, 201, 67, 69, 192, 67, 67, 190, 67, 66, 189,
				66, 64, 189, 66, 64, 189, 66, 64, 189, 66, 64, 189, 66, 64, 189, 66, 64, 187, 67, 64, 186, 67, 63, 185, 68, 62, 184, 68, 62, 184, 69,
				59, 183, 69, 58, 182, 69, 58, 176, 71, 56, 195, 65, 56, 199, 67, 58, 188, 75, 64, 152, 96, 73, 184, 78, 70, 192, 72, 72, 192, 67, 72,
				190, 64, 71, 191, 65, 72, 190, 64, 71, 189, 63, 70, 189, 62, 70, 193, 63, 71, 185, 57, 65, 196, 86, 90, 252, 163, 161, 255, 227, 214,
				255, 229, 212, 247, 193, 182, 206, 136, 128, 186, 96, 92, 208, 82, 86, 215, 79, 86, 210, 72, 79, 208, 70, 77, 202, 66, 69, 193, 66,
				67, 189, 66, 65, 189, 66, 64, 189, 66, 64, 189, 66, 64, 189, 66, 64, 189, 66, 64, 189, 66, 64, 189, 66, 64, 188, 66, 64, 187, 67, 64,
				185, 68, 62, 185, 68, 60, 184, 68, 60, 182, 69, 60, 182, 69, 58, 195, 65, 58, 196, 67, 60, 188, 77, 67, 151, 94, 71, 183, 76, 68, 193,
				73, 72, 193, 68, 73, 191, 64, 71, 192, 65, 72, 190, 63, 71, 189, 63, 70, 190, 63, 70, 192, 62, 70, 185, 57, 65, 196, 86, 90, 252, 161,
				161, 255, 221, 209, 255, 222, 208, 242, 184, 175, 201, 129, 123, 183, 95, 92, 210, 82, 88, 215, 78, 86, 213, 73, 83, 210, 69, 79, 203,
				66, 69, 194, 66, 67, 190, 66, 65, 190, 66, 63, 190, 66, 63, 190, 66, 63, 190, 66, 63, 190, 66, 63, 190, 66, 63, 190, 66, 63, 189, 66,
				64, 188, 67, 64, 186, 68, 63, 186, 68, 61, 185, 68, 60, 182, 69, 60, 185, 69, 58, 194, 65, 58, 195, 67, 60, 187, 76, 67, 147, 91, 68,
				182, 76, 68, 192, 71, 71, 194, 68, 73, 191, 63, 71, 193, 64, 72, 191, 63, 71, 190, 62, 70, 191, 62, 70, 193, 63, 71, 185, 57, 64, 199,
				88, 93, 255, 165, 165, 255, 217, 205, 255, 216, 207, 237, 176, 170, 193, 121, 118, 178, 93, 93, 205, 77, 87, 211, 72, 84, 211, 69, 82,
				209, 67, 80, 205, 66, 71, 196, 65, 67, 192, 65, 65, 191, 66, 62, 191, 66, 62, 191, 66, 62, 191, 66, 62, 191, 66, 62, 191, 66, 62, 191,
				66, 62, 190, 66, 62, 189, 66, 64, 187, 67, 64, 187, 67, 62, 186, 67, 61, 182, 69, 60, 187, 68, 58, 194, 66, 58, 192, 66, 58, 184, 73,
				64, 148, 88, 66, 182, 74, 66, 193, 70, 70, 196, 67, 73, 193, 63, 71, 194, 64, 72, 193, 63, 71, 192, 62, 70, 192, 62, 70, 193, 63, 71,
				187, 56, 64, 201, 89, 96, 255, 165, 169, 255, 214, 210, 255, 216, 212, 253, 204, 201, 198, 133, 131, 172, 95, 95, 184, 69, 78, 192,
				65, 77, 195, 64, 76, 196, 63, 76, 198, 63, 70, 192, 64, 66, 191, 66, 65, 191, 66, 62, 191, 66, 62, 191, 66, 62, 191, 66, 62, 191, 66,
				62, 191, 66, 62, 191, 66, 62, 191, 66, 62, 191, 66, 64, 189, 66, 66, 189, 66, 64, 187, 67, 63, 182, 69, 62, 196, 65, 60, 194, 66, 60,
				190, 67, 60, 185, 72, 66, 147, 87, 66, 182, 73, 67, 188, 70, 69, 191, 68, 74, 190, 65, 73, 190, 65, 74, 190, 65, 73, 189, 64, 73, 190,
				64, 73, 189, 64, 73, 181, 58, 66, 195, 90, 99, 254, 169, 175, 255, 217, 214, 255, 220, 216, 255, 223, 220, 214, 154, 152, 161, 89, 90,
				172, 77, 85, 178, 71, 81, 177, 66, 78, 178, 65, 77, 189, 63, 72, 186, 65, 69, 187, 65, 67, 193, 65, 65, 193, 65, 65, 193, 65, 65, 193,
				65, 66, 193, 65, 67, 193, 65, 67, 193, 65, 66, 192, 65, 65, 192, 67, 66, 190, 67, 67, 190, 67, 65, 188, 68, 64, 183, 70, 63, 197, 66,
				61, 195, 67, 61, 191, 68, 61, 186, 73, 67, 146, 88, 66, 182, 73, 68, 183, 72, 70, 184, 69, 75, 183, 66, 75, 183, 66, 75, 183, 66, 75,
				182, 65, 74, 183, 66, 75, 184, 67, 76, 177, 63, 71, 187, 90, 99, 249, 168, 175, 255, 216, 215, 255, 221, 219, 255, 218, 215, 203, 147,
				146, 155, 88, 89, 156, 70, 78, 163, 64, 74, 165, 62, 73, 172, 66, 77, 186, 65, 74, 185, 67, 73, 186, 67, 72, 191, 65, 69, 191, 65, 69,
				191, 65, 69, 191, 65, 69, 191, 65, 70, 191, 66, 70, 191, 66, 69, 192, 66, 69, 192, 68, 69, 191, 69, 71, 192, 69, 69, 190, 70, 68, 185,
				72, 67, 199, 67, 64, 196, 68, 64, 193, 69, 64, 188, 73, 68, 142, 89, 66, 180, 71, 68, 171, 71, 70, 163, 62, 69, 160, 59, 69, 160, 59,
				69, 160, 59, 69, 160, 59, 69, 162, 61, 71, 169, 68, 78, 171, 74, 83, 167, 82, 92, 234, 159, 168, 255, 214, 217, 255, 223, 223, 255,
				222, 222, 209, 159, 159, 144, 83, 84, 148, 69, 78, 157, 65, 75, 161, 65, 76, 173, 74, 86, 185, 71, 82, 183, 71, 81, 183, 69, 79, 188,
				67, 77, 188, 67, 77, 187, 67, 77, 187, 67, 76, 187, 67, 75, 188, 69, 76, 188, 68, 77, 190, 70, 79, 192, 71, 77, 194, 73, 79, 195, 72,
				77, 194, 73, 76, 188, 75, 75, 201, 68, 70, 198, 70, 71, 195, 70, 70, 191, 73, 72, 166, 128, 104, 173, 117, 104, 163, 91, 88, 158, 85,
				92, 156, 83, 93, 156, 83, 93, 156, 83, 93, 156, 83, 93, 160, 86, 96, 164, 91, 101, 166, 97, 106, 159, 100, 108, 222, 168, 175, 254,
				218, 223, 255, 224, 227, 254, 224, 226, 195, 161, 163, 141, 93, 97, 162, 100, 108, 169, 95, 104, 168, 89, 99, 165, 84, 94, 161, 81,
				90, 159, 78, 87, 159, 78, 86, 159, 79, 84, 159, 79, 84, 159, 79, 84, 159, 79, 84, 159, 79, 84, 159, 79, 84, 159, 79, 84, 161, 80, 85,
				166, 83, 87, 162, 85, 85, 165, 85, 82, 166, 84, 81, 166, 84, 81, 162, 85, 81, 170, 82, 81, 166, 80, 77, 150, 78, 70, 217, 191, 165,
				235, 201, 185, 223, 189, 181, 218, 188, 188, 216, 188, 190, 216, 188, 190, 216, 188, 190, 216, 188, 190, 215, 187, 189, 212, 184, 186,
				207, 180, 181, 204, 180, 182, 232, 208, 210, 250, 224, 226, 250, 227, 228, 254, 234, 235, 230, 206, 208, 191, 165, 166, 199, 170, 172,
				206, 174, 177, 211, 179, 181, 218, 185, 187, 222, 189, 191, 223, 190, 191, 223, 190, 191, 223, 190, 191, 223, 190, 191, 223, 190, 191,
				223, 190, 191, 223, 190, 191, 223, 190, 191, 223, 190, 191, 223, 190, 191, 225, 190, 189, 222, 191, 186, 224, 191, 183, 225, 191, 182,
				225, 191, 182, 222, 192, 182, 230, 190, 182, 227, 188, 180, 215, 190, 178, 227, 207, 180, 255, 236, 216, 249, 237, 227, 249, 239, 234,
				248, 239, 237, 248, 239, 237, 248, 239, 237, 248, 240, 237, 248, 238, 236, 244, 235, 232, 241, 231, 229, 237, 230, 227, 237, 229, 226,
				241, 228, 226, 241, 229, 228, 247, 238, 237, 240, 227, 226, 233, 221, 219, 236, 224, 222, 240, 228, 227, 244, 232, 230, 246, 234, 233,
				246, 236, 234, 246, 236, 234, 246, 237, 235, 246, 237, 235, 246, 237, 235, 246, 237, 235, 246, 237, 235, 246, 237, 235, 246, 237, 235,
				246, 237, 235, 246, 236, 234, 246, 236, 233, 245, 238, 229, 246, 237, 226, 246, 237, 225, 246, 237, 225, 245, 238, 225, 248, 235, 225,
				247, 236, 225, 243, 239, 225, 223, 204, 174, 255, 233, 211, 233, 234, 223, 230, 234, 227, 229, 234, 229, 229, 234, 229, 229, 234, 229,
				229, 234, 229, 229, 234, 229, 229, 234, 229, 229, 234, 229, 226, 235, 229, 224, 233, 227, 225, 233, 226, 224, 234, 228, 229, 239, 232,
				224, 234, 228, 223, 233, 226, 223, 233, 226, 223, 233, 226, 223, 233, 226, 223, 233, 226, 223, 233, 226, 223, 233, 226, 223, 233, 226,
				223, 233, 226, 223, 233, 226, 223, 233, 226, 223, 233, 226, 223, 233, 226, 223, 233, 226, 223, 233, 226, 223, 233, 225, 225, 233, 224,
				221, 234, 220, 224, 234, 217, 225, 234, 216, 225, 234, 216, 221, 235, 216, 229, 232, 216, 228, 232, 216, 218, 236, 216, 224, 198, 170,
				252, 221, 204, 250, 221, 209, 249, 217, 211, 249, 216, 211, 249, 216, 211, 249, 216, 211, 249, 216, 211, 249, 216, 211, 248, 217, 213,
				248, 219, 213, 241, 222, 216, 240, 227, 219, 236, 230, 218, 221, 236, 220, 227, 237, 221, 220, 229, 214, 225, 234, 219, 241, 229, 218,
				248, 227, 218, 250, 226, 218, 252, 225, 218, 252, 225, 220, 252, 225, 220, 252, 225, 220, 252, 225, 220, 252, 225, 220, 252, 225, 220,
				252, 225, 220, 252, 225, 220, 252, 225, 220, 252, 225, 220, 252, 225, 219, 254, 225, 218, 250, 227, 212, 253, 226, 209, 254, 226, 208,
				254, 226, 208, 250, 227, 208, 254, 225, 208, 253, 225, 208, 247, 228, 208, 178, 139, 111, 208, 138, 124, 210, 118, 118, 209, 117, 120,
				207, 115, 120, 207, 115, 120, 208, 115, 120, 208, 116, 121, 204, 113, 117, 199, 108, 112, 196, 111, 114, 195, 131, 130, 239, 194, 187,
				240, 229, 215, 224, 237, 218, 243, 228, 215, 231, 192, 184, 217, 133, 136, 210, 129, 130, 211, 129, 130, 212, 128, 130, 212, 128, 130,
				212, 128, 131, 212, 128, 131, 212, 128, 131, 212, 128, 131, 212, 128, 131, 212, 128, 131, 212, 128, 131, 212, 128, 131, 212, 128, 131,
				212, 128, 131, 212, 128, 130, 211, 128, 129, 216, 128, 124, 216, 128, 121, 216, 128, 120, 216, 128, 120, 213, 129, 120, 206, 130, 120,
				204, 131, 120, 206, 131, 120, 145, 100, 74, 169, 89, 76, 186, 75, 77, 183, 72, 77, 183, 71, 77, 183, 71, 77, 183, 71, 77, 184, 72, 78,
				178, 66, 73, 171, 60, 66, 167, 62, 66, 169, 89, 88, 232, 174, 168, 245, 228, 212, 227, 237, 216, 248, 224, 211, 225, 166, 160, 181,
				65, 72, 165, 58, 63, 165, 58, 63, 165, 58, 63, 165, 58, 63, 165, 58, 63, 163, 56, 61, 163, 56, 61, 163, 56, 61, 163, 56, 61, 163, 56,
				61, 163, 56, 61, 163, 56, 61, 163, 56, 61, 163, 56, 61, 162, 57, 61, 161, 58, 59, 168, 57, 56, 167, 58, 54, 167, 58, 53, 167, 58, 53,
				165, 59, 53, 155, 62, 53, 154, 64, 54, 166, 69, 61, 149, 98, 72, 177, 87, 75, 194, 73, 75, 192, 71, 74, 192, 71, 74, 192, 71, 74, 192,
				71, 74, 193, 72, 75, 187, 66, 70, 180, 59, 63, 178, 62, 62, 178, 89, 83, 240, 172, 162, 255, 225, 208, 233, 235, 211, 250, 219, 206,
				237, 160, 153, 201, 66, 73, 182, 61, 64, 182, 61, 64, 182, 61, 64, 182, 61, 64, 182, 61, 64, 181, 60, 62, 180, 60, 61, 180, 60, 61,
				180, 60, 61, 180, 60, 61, 180, 60, 61, 180, 60, 61, 180, 60, 61, 180, 60, 61, 180, 60, 61, 179, 61, 60, 183, 61, 56, 182, 61, 55, 182,
				62, 54, 182, 62, 54, 180, 62, 54, 171, 65, 54, 170, 66, 55, 181, 68, 59, 151, 94, 69, 179, 82, 69, 195, 72, 72, 195, 72, 74, 195, 72,
				74, 195, 72, 74, 195, 72, 74, 195, 72, 74, 191, 68, 70, 184, 61, 63, 180, 64, 64, 182, 90, 85, 243, 173, 163, 255, 225, 206, 235, 235,
				209, 250, 220, 204, 236, 157, 149, 203, 66, 71, 183, 60, 62, 183, 60, 62, 183, 60, 62, 183, 60, 62, 183, 60, 62, 183, 60, 62, 183, 60,
				62, 183, 60, 62, 183, 60, 62, 183, 60, 62, 183, 60, 62, 183, 60, 62, 183, 60, 62, 183, 60, 62, 183, 61, 62, 182, 61, 60, 186, 61, 57,
				184, 61, 54, 184, 62, 53, 184, 62, 53, 182, 63, 53, 173, 65, 53, 172, 66, 53, 183, 68, 57, 153, 91, 69, 177, 82, 71, 196, 73, 71, 195,
				72, 72, 195, 72, 72, 195, 72, 72, 195, 72, 72, 195, 72, 72, 192, 69, 69, 187, 62, 63, 182, 64, 63, 186, 93, 87, 247, 176, 164, 255,
				225, 206, 235, 235, 209, 250, 222, 205, 232, 155, 147, 200, 68, 72, 185, 62, 64, 184, 61, 63, 184, 61, 63, 184, 61, 63, 184, 61, 63,
				186, 60, 62, 187, 60, 61, 188, 61, 62, 188, 62, 62, 188, 62, 62, 188, 62, 62, 187, 61, 62, 188, 62, 62, 188, 62, 62, 187, 62, 62, 187,
				63, 62, 189, 63, 61, 188, 64, 59, 187, 64, 59, 187, 64, 59, 189, 63, 59, 182, 66, 59, 181, 67, 59, 187, 66, 60, 154, 88, 69, 175, 79,
				69, 193, 73, 69, 194, 72, 71, 194, 72, 72, 194, 72, 72, 194, 72, 72, 193, 72, 72, 189, 69, 68, 185, 62, 62, 177, 62, 60, 183, 91, 84,
				240, 169, 158, 255, 225, 206, 234, 235, 209, 250, 223, 206, 230, 155, 146, 199, 69, 73, 186, 63, 65, 185, 62, 64, 185, 62, 64, 184,
				61, 63, 185, 61, 63, 188, 61, 61, 190, 61, 61, 190, 62, 61, 191, 63, 63, 191, 63, 63, 191, 63, 63, 190, 62, 61, 190, 62, 61, 191, 63,
				63, 191, 63, 63, 189, 63, 62, 190, 63, 62, 188, 63, 61, 188, 64, 61, 188, 64, 61, 192, 63, 62, 188, 66, 62, 187, 65, 62, 189, 63, 60,
				158, 87, 69, 177, 78, 68, 186, 73, 67, 190, 73, 71, 190, 72, 71, 190, 72, 71, 190, 72, 71, 189, 74, 72, 186, 72, 70, 183, 67, 65, 172,
				63, 60, 175, 87, 80, 228, 160, 148, 255, 225, 206, 235, 235, 209, 250, 223, 206, 227, 155, 145, 199, 69, 73, 186, 63, 65, 185, 62, 64,
				185, 62, 64, 185, 62, 64, 190, 63, 64, 192, 61, 61, 193, 61, 60, 195, 63, 61, 196, 64, 62, 196, 64, 62, 196, 64, 62, 194, 62, 60, 195,
				63, 61, 196, 64, 62, 195, 64, 62, 193, 64, 63, 190, 63, 63, 188, 63, 63, 188, 63, 64, 190, 64, 65, 197, 62, 65, 196, 64, 66, 195, 63,
				65, 193, 59, 61, 162, 86, 70, 180, 77, 68, 180, 76, 70, 188, 75, 71, 189, 74, 70, 189, 74, 70, 189, 74, 70, 190, 73, 70, 191, 72, 69,
				187, 66, 63, 179, 63, 59, 183, 86, 79, 236, 161, 149, 255, 225, 206, 233, 234, 208, 250, 224, 207, 224, 155, 145, 195, 72, 74, 187,
				64, 66, 186, 63, 65, 186, 63, 65, 186, 63, 65, 190, 63, 64, 195, 63, 61, 197, 62, 60, 199, 62, 59, 199, 63, 59, 199, 63, 59, 199, 62,
				59, 198, 61, 58, 199, 62, 59, 199, 62, 59, 199, 63, 60, 196, 62, 60, 192, 62, 64, 191, 63, 65, 191, 64, 67, 193, 65, 68, 203, 63, 69,
				205, 63, 69, 204, 62, 68, 199, 57, 63, 167, 85, 70, 186, 76, 67, 189, 74, 68, 193, 74, 69, 194, 72, 68, 194, 72, 68, 194, 72, 68, 194,
				72, 67, 194, 70, 64, 186, 60, 56, 174, 51, 45, 191, 84, 78, 244, 160, 150, 255, 223, 208, 235, 233, 211, 250, 228, 213, 211, 155, 145,
				183, 79, 80, 166, 76, 73, 164, 73, 71, 164, 73, 71, 163, 72, 70, 168, 70, 68, 172, 69, 65, 174, 69, 64, 177, 68, 62, 176, 68, 62, 176,
				68, 62, 176, 68, 62, 177, 68, 62, 177, 68, 62, 176, 68, 62, 175, 68, 62, 174, 68, 63, 169, 67, 66, 169, 69, 68, 170, 70, 70, 171, 72,
				72, 181, 70, 72, 183, 70, 73, 182, 69, 72, 177, 64, 67, 170, 86, 70, 189, 75, 65, 192, 71, 65, 194, 70, 65, 194, 70, 65, 194, 70, 65,
				194, 70, 65, 193, 69, 62, 194, 70, 62, 185, 58, 51, 170, 45, 38, 195, 85, 77, 248, 161, 151, 255, 224, 208, 234, 234, 212, 250, 230,
				213, 202, 153, 142, 178, 85, 84, 170, 79, 78, 166, 76, 74, 166, 75, 73, 165, 74, 72, 169, 72, 70, 173, 71, 68, 175, 70, 67, 176, 69,
				65, 175, 68, 64, 175, 68, 64, 175, 67, 64, 175, 68, 64, 175, 68, 64, 174, 67, 63, 173, 66, 63, 171, 66, 63, 168, 67, 68, 169, 70, 72,
				170, 71, 74, 171, 73, 75, 181, 71, 76, 183, 71, 76, 182, 70, 75, 177, 65, 70, 172, 85, 67, 191, 74, 62, 197, 70, 62, 195, 68, 60, 195,
				68, 60, 195, 68, 60, 195, 68, 60, 193, 68, 58, 194, 69, 58, 187, 61, 51, 176, 52, 41, 197, 88, 77, 248, 164, 151, 255, 231, 209, 233,
				238, 213, 249, 232, 212, 192, 153, 138, 174, 95, 89, 193, 77, 79, 189, 72, 75, 188, 72, 75, 187, 71, 73, 190, 69, 70, 193, 69, 73,
				195, 69, 74, 195, 67, 72, 194, 66, 71, 193, 65, 70, 190, 62, 68, 190, 62, 68, 188, 60, 65, 186, 58, 63, 186, 58, 63, 185, 59, 64, 184,
				62, 72, 185, 65, 77, 187, 67, 79, 187, 68, 80, 196, 64, 79, 198, 65, 80, 198, 64, 79, 193, 59, 75, 163, 89, 67, 173, 81, 63, 180, 77,
				62, 180, 75, 60, 179, 74, 58, 177, 74, 58, 173, 75, 58, 159, 83, 61, 153, 87, 62, 146, 85, 60, 145, 84, 59, 160, 105, 82, 218, 175,
				152, 249, 233, 208, 214, 242, 212, 202, 211, 185, 174, 163, 141, 169, 116, 104, 162, 87, 80, 157, 82, 76, 156, 81, 75, 157, 82, 76,
				164, 82, 79, 167, 80, 77, 170, 81, 77, 172, 79, 76, 170, 77, 75, 167, 74, 71, 163, 70, 68, 161, 68, 65, 158, 65, 62, 155, 62, 59, 155,
				62, 60, 158, 62, 65, 165, 65, 70, 167, 65, 72, 170, 66, 75, 168, 65, 74, 167, 64, 73, 201, 54, 73, 204, 53, 72, 179, 58, 70,
			]
		),
	},
	{
		c: "es",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				83, 43, 42, 108, 58, 54, 121, 61, 55, 129, 60, 53, 135, 59, 52, 138, 57, 51, 140, 56, 51, 141, 55, 53, 140, 55, 55, 139, 55, 56, 138,
				56, 57, 138, 56, 58, 137, 56, 58, 139, 56, 59, 138, 56, 59, 138, 55, 59, 137, 55, 58, 137, 55, 58, 137, 55, 58, 137, 55, 58, 137, 54,
				58, 136, 54, 57, 137, 55, 58, 137, 55, 58, 137, 55, 58, 137, 55, 58, 137, 55, 58, 137, 55, 58, 137, 55, 58, 137, 55, 58, 137, 56, 57,
				136, 56, 55, 134, 56, 54, 136, 55, 53, 141, 53, 52, 143, 52, 52, 145, 51, 52, 144, 51, 53, 139, 54, 54, 132, 57, 56, 122, 60, 57, 107,
				61, 56, 97, 47, 43, 133, 67, 60, 151, 70, 62, 164, 70, 61, 174, 69, 60, 179, 66, 58, 183, 65, 58, 186, 63, 59, 187, 62, 61, 187, 62,
				62, 187, 62, 63, 185, 62, 64, 182, 63, 65, 179, 65, 67, 176, 66, 67, 176, 66, 67, 175, 66, 66, 175, 65, 66, 175, 65, 65, 174, 64, 65,
				174, 64, 65, 173, 64, 64, 175, 65, 65, 175, 65, 66, 175, 65, 66, 175, 65, 66, 175, 65, 66, 175, 65, 66, 175, 65, 66, 175, 65, 66, 176,
				65, 65, 179, 64, 62, 181, 63, 61, 184, 61, 60, 188, 59, 60, 189, 58, 60, 191, 57, 60, 188, 59, 61, 182, 62, 63, 171, 66, 65, 157, 71,
				68, 135, 70, 65, 105, 48, 39, 146, 70, 59, 164, 70, 58, 174, 65, 51, 182, 61, 45, 190, 57, 43, 196, 55, 42, 197, 53, 41, 199, 52, 43,
				200, 51, 44, 200, 51, 46, 199, 52, 47, 195, 54, 49, 190, 58, 52, 185, 60, 51, 186, 59, 52, 184, 59, 51, 184, 58, 50, 184, 58, 50, 183,
				58, 49, 183, 56, 49, 181, 57, 48, 185, 58, 51, 184, 59, 51, 184, 59, 51, 185, 59, 51, 184, 59, 51, 185, 58, 51, 183, 59, 50, 185, 58,
				51, 186, 58, 51, 190, 57, 49, 195, 55, 47, 199, 54, 45, 204, 51, 46, 205, 50, 46, 205, 50, 47, 202, 51, 49, 195, 55, 51, 183, 60, 55,
				168, 68, 60, 149, 74, 63, 109, 51, 36, 152, 74, 55, 168, 71, 50, 179, 65, 43, 189, 63, 38, 196, 60, 34, 202, 57, 33, 205, 56, 32, 206,
				55, 33, 206, 55, 34, 206, 55, 35, 205, 55, 36, 201, 57, 38, 196, 62, 41, 192, 64, 41, 192, 63, 42, 192, 63, 41, 191, 62, 41, 191, 62,
				40, 190, 62, 40, 191, 61, 41, 189, 62, 38, 192, 62, 41, 191, 63, 41, 192, 63, 41, 192, 63, 41, 191, 63, 41, 192, 63, 42, 191, 63, 40,
				192, 63, 42, 193, 62, 41, 195, 61, 39, 200, 61, 36, 205, 59, 36, 209, 56, 37, 213, 54, 39, 214, 53, 40, 210, 54, 43, 202, 58, 46, 190,
				63, 50, 174, 70, 56, 153, 75, 59, 104, 46, 26, 149, 72, 46, 161, 67, 37, 173, 63, 29, 184, 63, 27, 190, 60, 22, 195, 59, 20, 198, 58,
				18, 198, 57, 19, 198, 57, 20, 197, 57, 21, 196, 58, 23, 193, 59, 24, 191, 63, 26, 188, 64, 27, 188, 64, 27, 188, 64, 27, 187, 64, 27,
				187, 64, 27, 187, 64, 27, 187, 64, 27, 187, 64, 26, 188, 64, 27, 188, 64, 27, 188, 64, 27, 188, 64, 27, 187, 64, 27, 188, 64, 27, 187,
				64, 27, 188, 64, 27, 188, 64, 26, 187, 64, 24, 188, 64, 23, 192, 61, 23, 199, 58, 23, 203, 56, 25, 205, 54, 27, 203, 55, 30, 195, 58,
				35, 184, 63, 41, 169, 69, 47, 147, 73, 49, 104, 51, 25, 154, 84, 50, 167, 81, 41, 174, 76, 31, 182, 74, 25, 187, 73, 20, 190, 72, 17,
				191, 72, 15, 189, 73, 16, 188, 73, 16, 187, 73, 17, 185, 74, 19, 184, 74, 20, 183, 74, 20, 184, 75, 20, 184, 75, 21, 185, 75, 21, 185,
				76, 21, 185, 76, 22, 186, 76, 22, 186, 76, 22, 186, 76, 22, 185, 75, 21, 185, 75, 21, 185, 75, 21, 185, 75, 21, 185, 75, 21, 185, 75,
				21, 185, 75, 21, 185, 75, 21, 183, 76, 21, 178, 78, 20, 175, 78, 19, 178, 77, 19, 186, 73, 19, 192, 70, 21, 195, 67, 23, 195, 67, 28,
				189, 69, 33, 179, 73, 39, 167, 80, 47, 150, 87, 55, 117, 72, 39, 175, 116, 68, 192, 119, 61, 199, 115, 49, 206, 115, 42, 209, 114, 36,
				209, 116, 32, 208, 116, 32, 206, 117, 35, 204, 117, 37, 202, 117, 40, 201, 117, 42, 201, 115, 45, 201, 112, 46, 203, 112, 47, 203,
				113, 45, 204, 114, 44, 205, 115, 42, 206, 116, 41, 206, 117, 40, 207, 118, 39, 208, 118, 39, 206, 116, 37, 205, 116, 36, 206, 116, 36,
				206, 116, 36, 206, 116, 36, 206, 116, 36, 206, 116, 36, 206, 116, 36, 203, 117, 36, 198, 119, 36, 194, 121, 36, 195, 121, 36, 202,
				117, 36, 207, 114, 38, 212, 111, 42, 212, 110, 47, 209, 111, 52, 202, 113, 57, 191, 118, 66, 172, 120, 72, 131, 99, 56, 203, 157, 86,
				226, 167, 77, 234, 168, 66, 239, 168, 57, 239, 167, 47, 238, 172, 44, 236, 174, 49, 234, 173, 59, 231, 171, 65, 228, 168, 68, 229,
				166, 73, 229, 163, 81, 216, 148, 80, 202, 133, 67, 214, 146, 72, 224, 158, 74, 230, 165, 71, 233, 168, 66, 235, 171, 62, 236, 172, 59,
				236, 171, 55, 236, 171, 54, 236, 171, 54, 237, 170, 53, 238, 170, 53, 238, 170, 53, 238, 170, 53, 238, 170, 54, 238, 170, 55, 237,
				170, 55, 234, 172, 55, 231, 174, 55, 232, 174, 53, 235, 173, 52, 237, 171, 55, 241, 168, 63, 242, 166, 68, 240, 166, 70, 236, 168, 75,
				226, 169, 84, 205, 162, 89, 135, 116, 62, 220, 186, 91, 249, 203, 78, 255, 205, 62, 254, 203, 48, 252, 202, 34, 253, 211, 34, 249,
				213, 42, 245, 209, 61, 242, 203, 74, 236, 192, 72, 230, 181, 72, 220, 170, 80, 192, 143, 78, 152, 104, 44, 183, 138, 61, 207, 165, 70,
				223, 184, 71, 236, 197, 67, 245, 206, 63, 249, 210, 59, 245, 204, 48, 249, 208, 50, 250, 209, 49, 251, 208, 48, 252, 208, 48, 253,
				207, 48, 254, 207, 49, 254, 206, 50, 254, 206, 52, 254, 205, 52, 255, 206, 52, 255, 206, 50, 255, 208, 47, 254, 209, 46, 252, 209, 48,
				253, 205, 60, 253, 203, 66, 253, 202, 65, 252, 203, 67, 247, 203, 80, 230, 195, 93, 132, 117, 59, 217, 190, 81, 247, 208, 62, 253,
				209, 43, 255, 213, 33, 255, 221, 28, 252, 225, 21, 241, 218, 24, 236, 213, 48, 240, 209, 69, 226, 188, 60, 185, 143, 29, 144, 101, 11,
				144, 105, 44, 124, 89, 33, 136, 103, 31, 143, 112, 21, 171, 142, 28, 208, 181, 45, 235, 210, 57, 247, 222, 57, 235, 210, 33, 242, 214,
				34, 244, 215, 34, 245, 214, 33, 246, 214, 33, 247, 214, 34, 249, 212, 35, 249, 212, 35, 251, 211, 36, 252, 210, 36, 254, 210, 36, 255,
				210, 34, 253, 212, 29, 248, 216, 27, 245, 215, 31, 245, 213, 44, 245, 210, 49, 247, 209, 48, 247, 209, 50, 243, 208, 63, 228, 199, 79,
				133, 117, 58, 218, 189, 79, 247, 208, 61, 251, 206, 38, 252, 211, 29, 254, 221, 28, 248, 220, 19, 240, 217, 26, 230, 204, 44, 231,
				198, 63, 219, 179, 57, 167, 122, 28, 103, 58, 1, 99, 58, 5, 99, 62, 10, 94, 56, 4, 95, 60, 2, 139, 106, 19, 191, 160, 42, 222, 194,
				56, 247, 221, 64, 249, 223, 52, 245, 216, 38, 244, 216, 32, 245, 215, 32, 246, 214, 34, 247, 214, 35, 249, 212, 36, 249, 211, 38, 249,
				212, 36, 250, 211, 35, 253, 211, 35, 254, 212, 33, 251, 214, 29, 246, 217, 26, 242, 217, 29, 244, 214, 41, 244, 211, 46, 246, 210, 45,
				246, 210, 47, 242, 209, 61, 227, 200, 78, 133, 118, 58, 218, 191, 77, 246, 209, 58, 251, 209, 37, 253, 210, 27, 251, 215, 22, 241,
				212, 12, 244, 220, 31, 221, 192, 37, 208, 172, 43, 207, 164, 49, 179, 131, 33, 118, 70, 2, 80, 39, 1, 92, 54, 6, 89, 50, 1, 106, 68,
				11, 164, 128, 53, 203, 168, 71, 201, 170, 49, 218, 190, 42, 235, 209, 41, 242, 215, 36, 244, 217, 32, 245, 216, 32, 246, 215, 35, 247,
				214, 37, 249, 213, 40, 250, 212, 40, 250, 213, 37, 250, 213, 35, 251, 213, 33, 252, 213, 31, 249, 216, 28, 243, 219, 24, 240, 219, 27,
				241, 215, 38, 243, 213, 43, 244, 212, 41, 245, 211, 43, 241, 211, 58, 225, 201, 75, 134, 119, 55, 218, 192, 73, 246, 211, 54, 252,
				214, 38, 255, 215, 29, 251, 215, 20, 239, 212, 12, 247, 222, 36, 213, 183, 33, 189, 152, 29, 197, 151, 44, 191, 139, 45, 152, 102, 28,
				126, 85, 34, 121, 84, 36, 102, 62, 20, 114, 75, 29, 174, 136, 78, 204, 167, 89, 184, 151, 45, 201, 171, 34, 233, 205, 43, 241, 215,
				35, 244, 217, 29, 246, 217, 30, 246, 215, 34, 247, 214, 38, 248, 214, 41, 249, 213, 41, 249, 213, 37, 249, 214, 34, 250, 214, 32, 249,
				215, 30, 246, 217, 26, 241, 220, 22, 238, 220, 23, 239, 217, 35, 240, 214, 40, 243, 213, 37, 243, 213, 39, 240, 212, 54, 224, 203, 72,
				134, 120, 52, 218, 193, 69, 245, 213, 50, 251, 215, 34, 253, 215, 27, 251, 216, 21, 242, 216, 18, 244, 221, 38, 210, 180, 35, 187,
				148, 31, 195, 147, 46, 195, 141, 53, 177, 126, 51, 183, 142, 80, 150, 114, 64, 114, 74, 39, 109, 68, 35, 163, 122, 81, 196, 157, 97,
				183, 148, 56, 206, 176, 46, 241, 214, 53, 243, 218, 35, 244, 219, 26, 245, 218, 27, 246, 216, 33, 247, 215, 38, 247, 214, 41, 248,
				214, 41, 248, 215, 36, 249, 216, 32, 248, 216, 30, 247, 216, 29, 244, 218, 25, 239, 221, 21, 236, 221, 21, 238, 218, 32, 239, 215, 36,
				242, 214, 33, 243, 214, 35, 239, 213, 49, 224, 203, 69, 134, 122, 48, 217, 195, 65, 243, 214, 47, 247, 213, 29, 248, 212, 21, 249,
				216, 21, 244, 219, 23, 238, 216, 36, 211, 181, 41, 195, 155, 42, 198, 149, 53, 196, 140, 55, 185, 133, 57, 194, 155, 87, 145, 110, 56,
				118, 79, 46, 107, 65, 41, 156, 114, 85, 195, 155, 107, 191, 156, 75, 214, 185, 60, 239, 215, 54, 242, 220, 33, 243, 221, 22, 244, 220,
				24, 245, 218, 31, 246, 217, 37, 247, 215, 41, 247, 216, 39, 247, 217, 33, 248, 217, 29, 247, 217, 29, 246, 217, 29, 244, 219, 25, 239,
				222, 19, 235, 222, 20, 237, 219, 30, 239, 216, 33, 242, 215, 30, 243, 214, 31, 240, 214, 46, 224, 204, 66, 133, 123, 45, 215, 197, 63,
				242, 216, 46, 245, 214, 28, 245, 212, 20, 245, 215, 20, 242, 220, 27, 232, 211, 35, 210, 181, 44, 198, 159, 49, 197, 147, 54, 197,
				141, 57, 185, 134, 55, 155, 117, 43, 106, 74, 17, 116, 78, 44, 119, 78, 57, 165, 123, 101, 199, 158, 118, 194, 158, 82, 209, 180, 58,
				226, 201, 41, 238, 218, 28, 242, 222, 18, 243, 222, 20, 243, 220, 28, 244, 218, 35, 246, 216, 40, 246, 217, 38, 247, 218, 29, 247,
				219, 25, 247, 217, 27, 247, 216, 29, 244, 219, 25, 239, 222, 19, 236, 222, 20, 238, 219, 29, 240, 217, 32, 243, 215, 28, 244, 214, 29,
				241, 214, 43, 225, 204, 63, 131, 124, 42, 214, 199, 62, 240, 217, 47, 250, 220, 37, 251, 218, 32, 245, 216, 27, 243, 220, 33, 231,
				208, 40, 208, 178, 46, 192, 152, 46, 190, 138, 48, 200, 143, 61, 195, 143, 62, 136, 98, 19, 83, 49, 2, 110, 70, 37, 118, 76, 55, 158,
				114, 94, 184, 142, 105, 178, 141, 69, 202, 171, 51, 230, 206, 46, 239, 219, 28, 242, 223, 18, 243, 222, 20, 243, 220, 28, 244, 218,
				35, 244, 217, 42, 246, 217, 38, 246, 219, 28, 247, 219, 25, 248, 217, 28, 248, 215, 30, 246, 217, 29, 242, 220, 23, 239, 220, 23, 239,
				217, 31, 241, 215, 34, 245, 214, 30, 246, 214, 30, 243, 213, 45, 227, 203, 63, 125, 118, 36, 218, 202, 68, 240, 216, 51, 245, 213, 37,
				248, 212, 35, 245, 212, 33, 236, 209, 31, 243, 217, 56, 209, 176, 52, 187, 144, 45, 206, 152, 66, 225, 165, 85, 212, 158, 75, 181,
				141, 53, 132, 96, 22, 83, 41, 7, 59, 14, 5, 131, 86, 71, 198, 154, 116, 195, 157, 85, 203, 170, 52, 226, 198, 41, 240, 216, 30, 244,
				221, 22, 244, 220, 24, 245, 218, 33, 246, 217, 39, 246, 216, 44, 247, 215, 42, 247, 218, 30, 248, 217, 28, 250, 215, 32, 252, 212, 36,
				250, 213, 35, 246, 216, 29, 244, 217, 29, 245, 215, 38, 247, 213, 40, 251, 213, 36, 251, 212, 36, 248, 213, 50, 232, 204, 68, 126,
				116, 40, 219, 198, 74, 242, 212, 58, 249, 211, 49, 253, 213, 50, 251, 213, 50, 244, 210, 48, 249, 216, 70, 214, 175, 61, 190, 142, 51,
				209, 150, 70, 229, 164, 87, 219, 159, 77, 198, 152, 61, 149, 108, 29, 100, 52, 6, 78, 27, 1, 138, 87, 61, 193, 143, 102, 192, 147, 76,
				207, 167, 56, 242, 208, 61, 243, 212, 37, 243, 213, 27, 244, 213, 29, 245, 210, 37, 245, 209, 44, 246, 208, 48, 246, 208, 45, 246,
				210, 34, 248, 210, 32, 251, 206, 38, 254, 203, 44, 252, 204, 43, 247, 208, 38, 245, 208, 38, 246, 207, 45, 248, 206, 46, 252, 205, 41,
				253, 204, 40, 249, 205, 53, 232, 198, 69, 130, 115, 48, 220, 191, 80, 244, 203, 67, 250, 200, 58, 254, 201, 60, 252, 201, 60, 244,
				199, 58, 247, 203, 75, 216, 166, 67, 194, 136, 57, 210, 143, 71, 227, 156, 83, 220, 152, 75, 205, 148, 63, 168, 116, 40, 139, 81, 32,
				132, 72, 38, 174, 113, 81, 204, 144, 102, 197, 141, 74, 211, 161, 58, 249, 203, 71, 251, 207, 52, 251, 209, 44, 251, 208, 46, 251,
				206, 53, 251, 205, 59, 252, 204, 61, 252, 205, 59, 252, 207, 49, 252, 206, 47, 254, 202, 53, 255, 198, 60, 254, 199, 59, 252, 203, 53,
				251, 204, 53, 252, 202, 61, 253, 201, 62, 254, 200, 56, 254, 200, 55, 250, 200, 65, 231, 188, 74, 126, 104, 49, 208, 168, 75, 230,
				176, 62, 239, 174, 57, 245, 175, 61, 243, 176, 61, 235, 174, 58, 237, 179, 73, 214, 152, 72, 198, 130, 64, 212, 135, 73, 226, 144, 80,
				218, 139, 69, 199, 129, 53, 180, 113, 44, 172, 101, 54, 180, 108, 72, 203, 130, 96, 212, 139, 97, 201, 131, 70, 207, 141, 52, 234,
				173, 60, 237, 178, 48, 238, 179, 43, 238, 178, 45, 238, 177, 51, 238, 176, 55, 239, 175, 57, 238, 176, 55, 239, 178, 46, 240, 177, 44,
				242, 173, 51, 243, 170, 56, 242, 171, 55, 240, 174, 50, 239, 176, 50, 239, 174, 59, 239, 173, 60, 240, 173, 53, 240, 174, 50, 235,
				174, 59, 217, 164, 68, 114, 80, 43, 181, 128, 57, 199, 130, 42, 209, 128, 40, 217, 129, 45, 215, 128, 43, 207, 127, 39, 209, 134, 53,
				198, 120, 60, 190, 107, 58, 200, 111, 62, 210, 116, 62, 202, 110, 52, 187, 101, 40, 180, 96, 41, 181, 96, 55, 193, 106, 72, 201, 113,
				81, 201, 113, 74, 195, 109, 56, 195, 112, 40, 206, 125, 38, 205, 127, 28, 206, 127, 25, 206, 126, 28, 206, 125, 32, 207, 124, 35, 207,
				124, 36, 206, 125, 33, 207, 126, 25, 209, 125, 24, 213, 122, 30, 216, 120, 35, 214, 121, 34, 209, 124, 28, 206, 125, 29, 206, 124, 38,
				207, 123, 38, 209, 124, 31, 208, 125, 27, 202, 127, 36, 187, 125, 50, 102, 55, 37, 155, 87, 40, 169, 83, 21, 178, 77, 19, 184, 76, 24,
				180, 73, 20, 172, 73, 14, 174, 79, 25, 173, 77, 39, 172, 74, 42, 178, 75, 39, 181, 74, 33, 180, 73, 29, 181, 78, 34, 177, 75, 36, 176,
				73, 41, 179, 76, 46, 178, 74, 44, 178, 75, 41, 184, 81, 40, 184, 83, 31, 181, 82, 23, 180, 80, 17, 180, 79, 16, 181, 79, 18, 181, 79,
				21, 181, 78, 23, 182, 78, 22, 181, 79, 19, 182, 79, 13, 183, 79, 12, 186, 77, 16, 188, 75, 20, 186, 77, 18, 181, 80, 13, 178, 81, 13,
				178, 79, 22, 178, 80, 23, 179, 80, 16, 178, 82, 11, 171, 86, 19, 158, 86, 34, 103, 45, 45, 151, 69, 43, 166, 63, 27, 181, 63, 30, 190,
				64, 39, 186, 61, 36, 179, 61, 28, 178, 66, 35, 181, 70, 51, 183, 72, 56, 185, 70, 47, 185, 66, 35, 185, 64, 33, 185, 66, 40, 184, 64,
				41, 182, 62, 39, 179, 59, 35, 175, 56, 29, 178, 59, 31, 188, 69, 38, 189, 69, 37, 177, 58, 25, 183, 63, 31, 185, 64, 34, 185, 64, 37,
				185, 63, 39, 185, 63, 38, 186, 63, 36, 185, 64, 33, 186, 65, 29, 187, 65, 28, 189, 63, 30, 190, 63, 32, 187, 64, 31, 183, 68, 26, 179,
				69, 27, 179, 67, 36, 178, 67, 37, 179, 68, 30, 178, 70, 25, 170, 74, 29, 153, 73, 40, 113, 44, 59, 163, 68, 59, 184, 67, 51, 193, 59,
				50, 198, 55, 53, 197, 55, 52, 190, 58, 47, 184, 59, 45, 186, 63, 59, 189, 65, 62, 188, 61, 48, 188, 57, 36, 191, 59, 40, 194, 61, 50,
				193, 59, 52, 198, 66, 52, 196, 64, 46, 195, 63, 43, 196, 65, 43, 197, 65, 45, 200, 65, 50, 189, 56, 45, 192, 56, 52, 193, 56, 57, 193,
				56, 59, 193, 56, 60, 194, 56, 57, 194, 56, 54, 193, 57, 52, 194, 57, 48, 194, 57, 46, 197, 57, 48, 197, 57, 50, 194, 59, 47, 188, 63,
				44, 186, 63, 45, 185, 63, 54, 185, 62, 54, 185, 64, 46, 182, 66, 40, 175, 71, 45, 161, 75, 60, 106, 39, 57, 154, 64, 65, 177, 66, 63,
				185, 58, 61, 190, 54, 63, 194, 58, 65, 191, 61, 62, 182, 57, 55, 184, 60, 65, 186, 62, 65, 183, 58, 51, 185, 56, 42, 191, 60, 49, 191,
				58, 57, 188, 54, 55, 194, 62, 56, 190, 59, 47, 190, 59, 45, 189, 58, 44, 186, 54, 43, 194, 61, 56, 194, 61, 62, 191, 56, 65, 190, 54,
				68, 190, 54, 69, 191, 53, 69, 191, 54, 68, 191, 54, 65, 191, 54, 62, 191, 55, 60, 191, 55, 58, 192, 55, 59, 193, 56, 61, 191, 57, 59,
				186, 61, 55, 184, 61, 57, 182, 61, 65, 181, 60, 66, 180, 62, 60, 176, 65, 54, 168, 68, 57, 152, 68, 65, 104, 50, 61, 138, 67, 69, 158,
				71, 71, 166, 67, 71, 171, 63, 72, 176, 63, 71, 176, 65, 68, 173, 63, 64, 175, 63, 68, 176, 64, 67, 176, 62, 60, 177, 62, 56, 179, 63,
				58, 179, 62, 63, 178, 60, 63, 180, 63, 62, 178, 62, 58, 178, 63, 56, 178, 62, 56, 176, 60, 56, 180, 63, 62, 181, 63, 67, 180, 62, 70,
				180, 62, 71, 180, 62, 72, 180, 61, 72, 180, 61, 71, 180, 62, 70, 180, 62, 69, 180, 62, 68, 181, 62, 68, 182, 61, 68, 182, 61, 69, 180,
				62, 69, 178, 63, 67, 175, 64, 68, 174, 64, 73, 171, 65, 75, 169, 66, 73, 164, 69, 71, 156, 71, 72, 140, 68, 73, 92, 54, 56, 112, 63,
				63, 126, 65, 66, 132, 62, 65, 136, 59, 62, 140, 57, 61, 143, 56, 58, 145, 55, 56, 146, 55, 56, 147, 55, 55, 148, 55, 53, 148, 55, 51,
				148, 55, 52, 148, 57, 56, 148, 56, 57, 148, 57, 57, 148, 57, 56, 148, 57, 55, 148, 57, 55, 148, 57, 56, 147, 56, 56, 147, 56, 57, 149,
				58, 60, 149, 58, 60, 149, 58, 60, 149, 58, 60, 149, 58, 60, 149, 58, 60, 149, 58, 60, 149, 58, 60, 150, 57, 60, 151, 56, 61, 152, 55,
				62, 151, 55, 62, 150, 56, 62, 148, 56, 63, 147, 56, 65, 144, 57, 67, 140, 59, 68, 136, 61, 69, 129, 63, 70, 118, 62, 69,
			]
		),
	},
	{
		c: "fr",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				8, 40, 78, 0, 44, 96, 0, 48, 103, 0, 48, 103, 0, 49, 104, 0, 49, 104, 0, 49, 104, 0, 49, 104, 0, 50, 105, 0, 50, 105, 0, 44, 93, 0,
				50, 105, 0, 49, 102, 8, 43, 81, 242, 255, 255, 252, 254, 253, 253, 253, 251, 252, 255, 255, 255, 253, 255, 255, 253, 255, 255, 253,
				255, 255, 253, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 248, 255, 251, 252, 245, 235, 197, 105, 110, 193, 62,
				67, 190, 54, 54, 204, 51, 54, 198, 55, 59, 197, 58, 65, 191, 56, 50, 191, 56, 50, 191, 56, 50, 191, 56, 50, 191, 56, 50, 191, 56, 50,
				191, 56, 50, 191, 56, 50, 10, 42, 80, 1, 48, 100, 0, 47, 102, 0, 47, 102, 0, 47, 102, 0, 47, 102, 0, 47, 102, 0, 48, 103, 0, 48, 103,
				0, 48, 103, 0, 47, 96, 0, 51, 106, 0, 45, 98, 11, 46, 84, 240, 255, 255, 254, 255, 255, 251, 251, 249, 252, 255, 255, 255, 252, 255,
				255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 254, 252, 255, 255, 253, 255, 255, 253, 255, 248, 255, 251, 255, 254, 244,
				184, 92, 97, 188, 57, 62, 191, 55, 55, 205, 52, 55, 196, 53, 57, 193, 54, 61, 193, 58, 52, 193, 58, 52, 193, 58, 52, 193, 58, 52, 193,
				58, 52, 193, 58, 52, 193, 58, 52, 193, 58, 52, 8, 42, 87, 0, 49, 113, 2, 47, 104, 2, 47, 104, 2, 47, 104, 2, 47, 104, 2, 47, 104, 2,
				47, 104, 2, 47, 104, 2, 47, 104, 0, 46, 96, 0, 48, 110, 0, 43, 108, 12, 43, 89, 246, 255, 255, 255, 254, 248, 255, 251, 248, 255, 253,
				255, 255, 255, 253, 255, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 252, 255, 253, 252, 255, 253, 245, 255,
				254, 255, 253, 244, 202, 99, 102, 204, 61, 57, 197, 57, 40, 205, 54, 37, 191, 58, 39, 185, 62, 44, 194, 57, 49, 194, 57, 49, 194, 57,
				49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 9, 43, 88, 0, 50, 114, 1, 46, 103, 1, 46, 103, 1, 46, 103, 1, 46,
				103, 1, 46, 103, 1, 46, 103, 1, 46, 103, 1, 46, 103, 1, 47, 97, 0, 47, 109, 0, 44, 109, 15, 46, 92, 246, 255, 255, 255, 254, 248, 255,
				253, 250, 255, 253, 255, 254, 254, 252, 254, 254, 252, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 252, 255, 253, 252,
				255, 253, 248, 255, 255, 255, 249, 240, 203, 100, 103, 198, 55, 51, 193, 53, 36, 205, 54, 37, 194, 61, 42, 183, 60, 42, 194, 57, 49,
				194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 0, 49, 102, 0, 45, 102, 0, 47, 103, 0, 47,
				103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 1, 45, 106, 0, 47, 99, 0, 46, 105, 1, 46, 103, 255, 255,
				255, 255, 255, 253, 255, 254, 255, 254, 255, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 252, 255, 255, 210, 99, 92, 194, 56, 46, 195, 57, 57, 191, 57, 45, 193, 59, 50, 195,
				56, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 0, 49, 102, 0, 45,
				102, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 1, 45, 106, 0, 47, 99, 0, 46,
				105, 1, 46, 103, 255, 255, 255, 255, 255, 253, 255, 254, 255, 254, 255, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 252, 255, 255, 210, 99, 92, 194, 56, 46, 195, 57, 57,
				191, 57, 45, 193, 59, 50, 195, 56, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194,
				57, 49, 0, 49, 102, 0, 45, 102, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 1, 45,
				106, 0, 47, 99, 0, 46, 105, 1, 46, 103, 255, 255, 255, 255, 255, 253, 255, 254, 255, 254, 255, 251, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 252, 255, 255, 210, 99, 92, 194,
				56, 46, 195, 57, 57, 191, 57, 45, 193, 59, 50, 195, 56, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57,
				49, 194, 57, 49, 194, 57, 49, 0, 49, 102, 0, 45, 102, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47,
				103, 0, 47, 103, 1, 45, 106, 0, 47, 99, 0, 46, 105, 1, 46, 103, 255, 255, 255, 255, 255, 253, 255, 254, 255, 254, 255, 251, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 252, 255,
				255, 210, 99, 92, 194, 56, 46, 195, 57, 57, 191, 57, 45, 193, 59, 50, 195, 56, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49,
				194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 0, 49, 102, 0, 45, 102, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47,
				103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 1, 45, 106, 0, 47, 99, 0, 46, 105, 1, 46, 103, 255, 255, 255, 255, 255, 253, 255, 254, 255,
				254, 255, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 254, 255, 252, 255, 255, 210, 99, 92, 194, 56, 46, 195, 57, 57, 191, 57, 45, 193, 59, 50, 195, 56, 49, 194, 57, 49, 194, 57, 49,
				194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 0, 49, 102, 0, 45, 102, 0, 47, 103, 0, 47, 103, 0, 47,
				103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 1, 45, 106, 0, 47, 99, 0, 46, 105, 1, 46, 103, 255, 255, 255, 255,
				255, 253, 255, 254, 255, 254, 255, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 254, 255, 252, 255, 255, 210, 99, 92, 194, 56, 46, 195, 57, 57, 191, 57, 45, 193, 59, 50, 195, 56, 49,
				194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 0, 50, 103, 0, 45, 102, 0, 47,
				103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 1, 45, 106, 0, 47, 99, 0, 46, 105, 1, 46,
				103, 255, 255, 255, 255, 255, 253, 255, 254, 255, 254, 255, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 252, 255, 255, 210, 99, 92, 194, 56, 46, 195, 57, 57, 191, 57, 45,
				193, 59, 50, 195, 56, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 0,
				50, 103, 0, 45, 102, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 1, 45, 106, 0,
				47, 99, 0, 46, 105, 1, 46, 103, 255, 255, 255, 255, 255, 253, 255, 254, 255, 254, 255, 251, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 252, 255, 255, 210, 99, 92, 194, 56,
				46, 195, 57, 57, 191, 57, 45, 193, 59, 50, 195, 56, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49,
				194, 57, 49, 194, 57, 49, 0, 47, 100, 1, 46, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103,
				0, 47, 103, 1, 45, 106, 0, 47, 99, 0, 46, 105, 1, 46, 103, 255, 255, 255, 255, 255, 253, 255, 254, 255, 254, 255, 251, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 252, 255, 255,
				210, 99, 92, 194, 56, 46, 195, 57, 57, 191, 57, 45, 193, 59, 50, 195, 56, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194,
				57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 0, 47, 100, 1, 46, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0,
				47, 103, 0, 47, 103, 0, 47, 103, 1, 45, 106, 0, 47, 99, 0, 46, 105, 1, 46, 103, 255, 255, 255, 255, 255, 253, 255, 254, 255, 254, 255,
				251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254,
				255, 252, 255, 255, 210, 99, 92, 194, 56, 46, 195, 57, 57, 191, 57, 45, 193, 59, 50, 195, 56, 49, 194, 57, 49, 194, 57, 49, 194, 57,
				49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 0, 48, 101, 1, 46, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0,
				47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 1, 45, 106, 0, 47, 99, 0, 46, 105, 1, 46, 103, 255, 255, 255, 255, 255, 253,
				255, 254, 255, 254, 255, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 254, 255, 252, 255, 255, 210, 99, 92, 194, 56, 46, 195, 57, 57, 191, 57, 45, 193, 59, 50, 195, 56, 49, 194, 57,
				49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 0, 48, 101, 1, 46, 103, 0, 47, 103, 0,
				47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 1, 45, 106, 0, 47, 99, 0, 46, 105, 1, 46, 103, 255,
				255, 255, 255, 255, 253, 255, 254, 255, 254, 255, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 252, 255, 255, 210, 99, 92, 194, 56, 46, 195, 57, 57, 191, 57, 45, 193, 59, 50,
				195, 56, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 0, 48, 101, 1,
				46, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 1, 45, 106, 0, 47, 99, 0, 46,
				105, 1, 46, 103, 255, 255, 255, 255, 255, 253, 255, 254, 255, 254, 255, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 252, 255, 255, 210, 99, 92, 194, 56, 46, 195, 57, 57,
				191, 57, 45, 193, 59, 50, 195, 56, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194,
				57, 49, 0, 48, 101, 1, 46, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 1, 45,
				106, 0, 47, 99, 0, 46, 105, 1, 46, 103, 255, 255, 255, 255, 255, 253, 255, 254, 255, 254, 255, 251, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 252, 255, 255, 210, 99, 92, 194,
				56, 46, 195, 57, 57, 191, 57, 45, 193, 59, 50, 195, 56, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57,
				49, 194, 57, 49, 194, 57, 49, 0, 48, 101, 1, 46, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47,
				103, 0, 47, 103, 1, 45, 106, 0, 47, 99, 0, 46, 105, 1, 46, 103, 255, 255, 255, 255, 255, 253, 255, 254, 255, 254, 255, 251, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 252, 255,
				255, 210, 99, 92, 194, 56, 46, 195, 57, 57, 191, 57, 45, 193, 59, 50, 195, 56, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49,
				194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 0, 48, 101, 1, 46, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 0, 47,
				103, 0, 47, 103, 0, 47, 103, 0, 47, 103, 1, 45, 106, 0, 47, 99, 0, 46, 105, 1, 46, 103, 255, 255, 255, 255, 255, 253, 255, 254, 255,
				254, 255, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 254, 255, 252, 255, 255, 210, 99, 92, 194, 56, 46, 195, 57, 57, 191, 57, 45, 193, 59, 50, 195, 56, 49, 194, 57, 49, 194, 57, 49,
				194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 12, 40, 105, 0, 48, 105, 1, 46, 101, 1, 46, 101, 1, 46,
				101, 1, 46, 101, 1, 46, 101, 1, 46, 101, 1, 46, 101, 1, 46, 101, 0, 50, 99, 4, 44, 103, 0, 48, 103, 0, 46, 117, 255, 254, 243, 255,
				252, 255, 255, 255, 255, 255, 250, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255,
				254, 255, 255, 254, 255, 252, 255, 255, 252, 255, 243, 207, 100, 94, 194, 56, 46, 185, 63, 48, 203, 50, 52, 193, 58, 55, 190, 59, 51,
				194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 12, 40, 105, 0, 48, 105, 1,
				46, 101, 1, 46, 101, 1, 46, 101, 1, 46, 101, 1, 46, 101, 1, 46, 101, 1, 46, 101, 1, 46, 101, 0, 50, 99, 4, 44, 103, 0, 48, 103, 0, 46,
				117, 255, 254, 243, 255, 252, 255, 255, 255, 255, 255, 250, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254,
				255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 252, 255, 255, 252, 255, 243, 207, 100, 94, 194, 56, 46, 185, 63, 48, 203, 50, 52,
				193, 58, 55, 190, 59, 51, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 194, 57, 49, 9,
				42, 109, 0, 49, 106, 0, 47, 105, 0, 47, 105, 0, 47, 105, 0, 47, 105, 0, 47, 105, 0, 47, 105, 0, 47, 105, 0, 47, 105, 0, 47, 99, 7, 43,
				101, 0, 47, 101, 0, 47, 113, 255, 255, 243, 251, 255, 255, 245, 255, 255, 252, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 255, 255, 255, 244, 208, 98, 97, 196, 55, 48,
				189, 61, 48, 205, 49, 50, 198, 57, 50, 194, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195,
				57, 47, 195, 57, 47, 9, 42, 109, 0, 49, 106, 0, 47, 105, 0, 47, 105, 0, 47, 105, 0, 47, 105, 0, 47, 105, 0, 47, 105, 0, 47, 105, 0,
				47, 105, 0, 47, 99, 7, 43, 101, 0, 47, 101, 0, 47, 113, 255, 255, 243, 251, 255, 255, 245, 255, 255, 252, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 255, 255, 255, 244,
				208, 98, 97, 196, 55, 48, 189, 61, 48, 205, 49, 50, 198, 57, 50, 194, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 195,
				57, 47, 195, 57, 47, 195, 57, 47, 195, 57, 47, 9, 43, 104, 0, 49, 101, 0, 46, 105, 0, 46, 105, 0, 46, 105, 0, 46, 105, 0, 46, 105, 0,
				46, 105, 0, 46, 105, 0, 46, 105, 0, 52, 99, 0, 48, 99, 0, 49, 97, 0, 48, 105, 255, 255, 248, 254, 255, 255, 252, 255, 253, 255, 253,
				253, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 251,
				255, 255, 253, 246, 204, 100, 101, 191, 56, 53, 189, 61, 52, 203, 51, 50, 195, 58, 50, 190, 60, 47, 191, 58, 49, 191, 58, 49, 191, 58,
				49, 191, 58, 49, 191, 58, 49, 191, 58, 49, 191, 58, 49, 191, 58, 49, 9, 43, 104, 0, 49, 101, 0, 46, 105, 0, 46, 105, 0, 46, 105, 0,
				46, 105, 0, 46, 105, 0, 46, 105, 0, 46, 105, 0, 46, 105, 0, 52, 99, 0, 48, 99, 0, 49, 97, 0, 48, 105, 255, 255, 248, 254, 255, 255,
				252, 255, 253, 255, 253, 253, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 251, 255, 255, 253, 246, 204, 100, 101, 191, 56, 53, 189, 61, 52, 203, 51, 50, 195, 58, 50, 190, 60, 47, 191, 58,
				49, 191, 58, 49, 191, 58, 49, 191, 58, 49, 191, 58, 49, 191, 58, 49, 191, 58, 49, 191, 58, 49, 18, 42, 88, 7, 45, 82, 0, 47, 99, 0,
				47, 99, 0, 47, 99, 0, 47, 99, 0, 47, 99, 0, 47, 99, 0, 47, 99, 0, 47, 99, 0, 44, 115, 4, 42, 113, 7, 42, 106, 4, 44, 105, 255, 253,
				255, 255, 254, 255, 255, 255, 253, 255, 253, 250, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255,
				255, 254, 255, 255, 254, 255, 255, 248, 255, 248, 255, 255, 237, 201, 102, 97, 196, 54, 53, 199, 56, 52, 205, 49, 52, 193, 58, 52,
				184, 62, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 18, 42, 88, 7,
				45, 82, 0, 47, 99, 0, 47, 99, 0, 47, 99, 0, 47, 99, 0, 47, 99, 0, 47, 99, 0, 47, 99, 0, 47, 99, 0, 44, 115, 4, 42, 113, 7, 42, 106, 4,
				44, 105, 255, 253, 255, 255, 254, 255, 255, 255, 253, 255, 253, 250, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254,
				255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 248, 255, 248, 255, 255, 237, 201, 102, 97, 196, 54, 53, 199, 56, 52, 205, 49,
				52, 193, 58, 52, 184, 62, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51, 195, 56, 51,
			]
		),
	},
	{
		c: "fi",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				195, 197, 201, 209, 212, 215, 209, 209, 216, 212, 212, 215, 212, 210, 213, 213, 210, 211, 217, 213, 210, 217, 211, 207, 216, 210, 206,
				215, 210, 209, 212, 210, 213, 209, 211, 217, 187, 192, 205, 129, 140, 166, 71, 96, 133, 35, 79, 127, 33, 85, 136, 31, 78, 124, 42, 83,
				122, 52, 85, 117, 95, 120, 144, 177, 194, 205, 204, 213, 218, 209, 212, 215, 212, 211, 212, 213, 211, 209, 214, 211, 208, 214, 211,
				208, 214, 211, 209, 213, 211, 210, 213, 212, 211, 212, 212, 213, 212, 213, 215, 211, 214, 216, 212, 214, 216, 212, 213, 215, 212, 211,
				214, 212, 212, 215, 213, 212, 215, 212, 210, 214, 213, 209, 214, 163, 157, 162, 239, 240, 243, 249, 251, 253, 252, 252, 255, 250, 249,
				252, 254, 253, 254, 251, 248, 247, 253, 250, 247, 255, 251, 246, 253, 250, 245, 252, 250, 248, 250, 251, 253, 247, 252, 255, 219, 227,
				238, 142, 159, 188, 66, 101, 145, 21, 80, 140, 19, 86, 152, 19, 78, 138, 31, 82, 133, 43, 84, 124, 99, 130, 160, 209, 229, 236, 242,
				252, 255, 250, 252, 254, 254, 253, 251, 255, 252, 247, 255, 252, 245, 255, 252, 245, 255, 252, 246, 255, 252, 248, 255, 253, 250, 254,
				253, 252, 253, 253, 253, 252, 254, 254, 253, 253, 254, 252, 253, 253, 253, 252, 254, 254, 253, 253, 254, 252, 253, 253, 249, 252, 254,
				250, 253, 185, 179, 182, 229, 230, 232, 247, 248, 252, 255, 254, 255, 244, 243, 248, 253, 251, 254, 253, 251, 250, 253, 249, 245, 254,
				251, 245, 253, 252, 246, 251, 252, 250, 245, 250, 254, 241, 249, 255, 214, 226, 238, 137, 158, 190, 60, 101, 151, 11, 80, 150, 9, 86,
				163, 14, 83, 152, 25, 84, 142, 35, 82, 128, 91, 126, 160, 207, 228, 235, 238, 249, 255, 247, 250, 253, 254, 251, 249, 255, 251, 245,
				255, 250, 242, 255, 251, 243, 255, 251, 245, 255, 252, 248, 255, 253, 250, 253, 253, 252, 251, 252, 252, 252, 254, 253, 252, 252, 253,
				250, 250, 250, 252, 250, 252, 253, 251, 252, 253, 249, 252, 251, 246, 248, 253, 247, 250, 187, 179, 183, 224, 224, 225, 252, 253, 255,
				255, 254, 255, 249, 248, 252, 253, 251, 254, 254, 254, 253, 254, 252, 247, 255, 254, 247, 254, 254, 248, 252, 255, 252, 246, 252, 255,
				240, 251, 255, 213, 228, 239, 136, 159, 194, 58, 102, 156, 7, 80, 156, 3, 85, 166, 14, 87, 160, 21, 83, 145, 35, 84, 133, 92, 129,
				164, 210, 229, 236, 241, 252, 255, 250, 253, 254, 255, 254, 250, 255, 253, 247, 255, 254, 246, 255, 254, 248, 254, 254, 250, 254, 254,
				252, 253, 255, 255, 252, 255, 255, 252, 254, 254, 253, 255, 254, 253, 253, 253, 252, 252, 252, 254, 253, 253, 255, 253, 254, 255, 252,
				252, 253, 247, 248, 253, 248, 250, 188, 181, 184, 229, 230, 229, 253, 252, 253, 254, 253, 255, 254, 253, 255, 254, 252, 254, 254, 253,
				252, 253, 251, 245, 254, 253, 246, 251, 253, 246, 250, 254, 250, 247, 254, 255, 242, 254, 255, 213, 229, 240, 135, 159, 197, 56, 101,
				158, 10, 84, 160, 1, 84, 166, 14, 88, 163, 16, 79, 142, 36, 83, 133, 95, 130, 165, 210, 229, 237, 245, 253, 255, 252, 254, 254, 255,
				254, 251, 255, 254, 249, 255, 255, 249, 254, 255, 252, 252, 255, 255, 249, 255, 255, 247, 255, 255, 248, 255, 255, 252, 255, 255, 254,
				255, 253, 254, 254, 252, 254, 253, 251, 255, 255, 252, 255, 255, 253, 255, 253, 251, 253, 248, 247, 254, 250, 250, 186, 180, 181, 225,
				227, 221, 248, 248, 247, 255, 253, 254, 253, 251, 255, 255, 253, 254, 255, 255, 251, 254, 255, 250, 253, 255, 249, 251, 254, 247, 251,
				254, 251, 248, 253, 254, 243, 252, 254, 214, 228, 240, 132, 158, 196, 55, 103, 159, 10, 83, 158, 2, 83, 162, 14, 88, 162, 14, 79, 141,
				37, 85, 135, 95, 131, 166, 209, 227, 237, 243, 250, 254, 252, 252, 252, 255, 253, 250, 255, 253, 249, 255, 254, 250, 253, 254, 253,
				250, 255, 255, 248, 255, 255, 248, 255, 255, 249, 255, 255, 253, 255, 255, 255, 255, 253, 255, 255, 253, 255, 254, 252, 255, 254, 251,
				255, 254, 251, 255, 253, 249, 255, 248, 245, 255, 250, 249, 189, 183, 184, 221, 228, 216, 254, 255, 248, 254, 248, 250, 255, 251, 255,
				255, 254, 252, 253, 253, 248, 250, 254, 250, 248, 255, 251, 250, 255, 249, 254, 255, 249, 253, 253, 246, 249, 253, 246, 215, 226, 237,
				127, 154, 191, 55, 103, 159, 13, 85, 156, 5, 89, 161, 7, 84, 153, 11, 81, 141, 32, 85, 134, 90, 128, 161, 212, 229, 235, 245, 249,
				250, 252, 251, 248, 255, 252, 246, 255, 253, 247, 255, 253, 251, 254, 254, 253, 253, 254, 255, 253, 255, 255, 254, 255, 255, 254, 255,
				255, 254, 254, 255, 255, 255, 255, 255, 254, 252, 255, 252, 249, 255, 253, 249, 255, 254, 248, 255, 251, 244, 252, 245, 239, 253, 249,
				245, 183, 181, 180, 224, 232, 221, 254, 255, 250, 250, 244, 250, 255, 248, 255, 255, 253, 255, 254, 255, 253, 248, 255, 254, 247, 255,
				255, 251, 255, 255, 254, 255, 253, 251, 251, 244, 248, 250, 243, 217, 229, 240, 132, 161, 198, 59, 108, 165, 10, 82, 152, 5, 89, 162,
				11, 91, 160, 17, 89, 151, 36, 93, 144, 92, 134, 169, 210, 230, 237, 244, 251, 254, 252, 252, 251, 255, 253, 248, 255, 253, 249, 254,
				254, 252, 254, 254, 255, 253, 254, 255, 254, 254, 255, 255, 254, 255, 255, 254, 255, 254, 254, 255, 255, 255, 255, 255, 254, 255, 255,
				252, 251, 255, 254, 250, 255, 254, 250, 255, 252, 248, 251, 247, 244, 247, 245, 244, 181, 180, 181, 232, 234, 233, 254, 255, 255, 255,
				252, 255, 255, 252, 255, 255, 253, 255, 251, 253, 255, 249, 254, 255, 247, 255, 255, 250, 255, 255, 253, 254, 255, 253, 252, 254, 250,
				253, 254, 215, 227, 240, 125, 154, 196, 46, 97, 155, 6, 81, 151, 0, 85, 160, 2, 86, 159, 4, 82, 148, 23, 87, 142, 82, 129, 172, 196,
				226, 238, 237, 253, 255, 250, 255, 255, 255, 255, 255, 253, 255, 255, 252, 255, 255, 251, 255, 255, 251, 255, 255, 253, 255, 255, 255,
				254, 255, 255, 254, 255, 254, 255, 255, 254, 255, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 255, 255, 252, 255, 255, 247,
				252, 254, 249, 253, 254, 180, 184, 187, 200, 207, 222, 224, 238, 255, 223, 236, 255, 224, 237, 255, 223, 236, 255, 220, 234, 255, 219,
				237, 255, 217, 236, 255, 216, 233, 255, 219, 232, 255, 221, 234, 255, 221, 237, 255, 192, 217, 242, 114, 155, 203, 47, 105, 167, 11,
				87, 158, 4, 90, 165, 6, 91, 166, 6, 88, 156, 23, 94, 154, 75, 133, 183, 171, 213, 240, 208, 239, 255, 217, 239, 254, 220, 238, 253,
				218, 238, 254, 215, 239, 255, 215, 239, 255, 216, 240, 255, 218, 239, 255, 222, 238, 254, 222, 238, 253, 217, 237, 255, 217, 237, 255,
				219, 235, 253, 220, 235, 252, 220, 236, 252, 218, 238, 254, 213, 237, 255, 210, 235, 254, 219, 240, 254, 163, 179, 191, 103, 128, 162,
				108, 145, 185, 97, 139, 181, 98, 141, 183, 101, 140, 183, 101, 140, 185, 99, 141, 187, 98, 140, 187, 99, 140, 186, 102, 141, 186, 101,
				138, 185, 99, 139, 187, 86, 135, 188, 51, 112, 172, 22, 92, 158, 3, 81, 151, 1, 83, 156, 2, 88, 163, 1, 84, 156, 4, 82, 148, 28, 99,
				158, 78, 139, 188, 93, 145, 187, 95, 144, 183, 96, 144, 183, 93, 145, 187, 89, 146, 192, 87, 147, 194, 89, 147, 195, 91, 147, 193, 94,
				146, 189, 93, 146, 189, 89, 145, 193, 87, 144, 192, 91, 143, 188, 92, 142, 185, 93, 143, 185, 91, 143, 186, 88, 143, 188, 88, 142,
				187, 104, 149, 188, 92, 125, 155, 47, 85, 133, 36, 92, 147, 21, 86, 140, 22, 89, 142, 23, 87, 143, 26, 88, 146, 27, 88, 151, 25, 85,
				150, 26, 85, 147, 30, 88, 147, 30, 86, 148, 26, 86, 151, 21, 89, 156, 10, 88, 155, 5, 85, 153, 6, 86, 156, 5, 88, 159, 6, 94, 168, 2,
				90, 165, 0, 83, 154, 4, 85, 152, 19, 94, 153, 19, 88, 142, 20, 87, 140, 20, 89, 143, 17, 90, 149, 14, 92, 155, 14, 92, 157, 14, 92,
				158, 15, 91, 155, 17, 91, 151, 17, 91, 152, 14, 92, 158, 14, 90, 157, 16, 88, 150, 19, 89, 149, 19, 90, 149, 16, 89, 150, 14, 89, 153,
				18, 90, 151, 28, 89, 141, 37, 81, 121, 34, 81, 131, 20, 88, 147, 8, 90, 144, 9, 95, 150, 14, 93, 152, 17, 92, 156, 18, 92, 161, 16,
				88, 158, 15, 87, 154, 18, 89, 154, 19, 90, 158, 17, 90, 161, 11, 92, 162, 4, 93, 158, 0, 87, 151, 2, 84, 152, 2, 84, 154, 2, 91, 166,
				1, 91, 167, 0, 88, 163, 6, 93, 164, 12, 93, 158, 14, 90, 150, 14, 89, 148, 13, 89, 149, 10, 91, 154, 7, 92, 159, 7, 92, 161, 9, 91,
				160, 11, 91, 156, 14, 89, 151, 14, 90, 152, 11, 92, 159, 9, 89, 158, 13, 88, 152, 16, 88, 151, 14, 89, 153, 10, 88, 156, 7, 90, 161,
				11, 92, 161, 22, 89, 148, 34, 82, 125, 37, 87, 137, 15, 89, 149, 3, 92, 145, 3, 93, 147, 5, 90, 148, 7, 88, 151, 7, 86, 157, 9, 86,
				158, 11, 88, 156, 11, 89, 154, 9, 87, 156, 6, 86, 159, 4, 91, 161, 2, 97, 160, 1, 91, 153, 5, 88, 153, 3, 84, 154, 3, 91, 166, 0, 89,
				166, 0, 88, 164, 4, 94, 165, 6, 89, 156, 11, 89, 152, 11, 88, 149, 9, 87, 150, 6, 89, 154, 4, 89, 157, 4, 90, 158, 6, 90, 156, 11, 88,
				151, 15, 86, 146, 14, 87, 147, 10, 89, 155, 8, 86, 153, 13, 84, 147, 15, 85, 146, 12, 86, 151, 7, 86, 154, 4, 88, 160, 7, 91, 162, 18,
				89, 149, 36, 84, 128, 42, 92, 140, 16, 90, 148, 3, 93, 144, 5, 97, 149, 5, 92, 147, 7, 89, 150, 10, 89, 158, 9, 86, 156, 11, 89, 155,
				12, 91, 155, 10, 89, 157, 7, 88, 160, 4, 91, 159, 0, 94, 155, 2, 91, 151, 7, 89, 153, 7, 87, 155, 2, 88, 161, 0, 90, 164, 0, 88, 163,
				2, 92, 162, 5, 88, 153, 8, 86, 147, 11, 88, 147, 11, 89, 150, 9, 90, 153, 6, 89, 156, 5, 89, 156, 7, 88, 153, 11, 87, 148, 17, 86,
				143, 16, 86, 144, 11, 88, 152, 10, 86, 151, 15, 85, 145, 18, 85, 144, 14, 86, 148, 9, 87, 153, 5, 89, 160, 8, 91, 161, 19, 88, 147,
				37, 84, 126, 36, 80, 127, 16, 83, 139, 7, 92, 141, 6, 96, 144, 8, 90, 142, 13, 89, 147, 16, 89, 154, 12, 84, 151, 14, 87, 149, 16, 89,
				150, 13, 86, 151, 11, 85, 155, 8, 89, 155, 3, 91, 150, 4, 90, 148, 8, 87, 151, 8, 87, 154, 1, 85, 158, 1, 88, 161, 0, 87, 159, 2, 88,
				156, 9, 88, 150, 10, 85, 142, 14, 88, 144, 16, 91, 147, 13, 91, 150, 9, 90, 152, 8, 89, 153, 10, 89, 151, 14, 88, 146, 19, 87, 141,
				18, 87, 143, 13, 88, 150, 13, 87, 151, 19, 86, 145, 21, 86, 143, 17, 87, 147, 13, 88, 152, 8, 90, 158, 12, 91, 156, 20, 86, 141, 39,
				84, 123, 46, 81, 125, 33, 89, 141, 29, 100, 148, 21, 95, 142, 24, 93, 142, 27, 91, 147, 28, 91, 151, 27, 89, 150, 31, 92, 151, 32, 93,
				149, 28, 88, 148, 27, 89, 153, 23, 93, 156, 11, 89, 149, 5, 84, 144, 8, 84, 147, 9, 86, 153, 6, 87, 158, 5, 90, 161, 2, 85, 154, 4,
				84, 149, 15, 90, 147, 17, 87, 139, 20, 87, 139, 20, 89, 141, 16, 89, 144, 12, 89, 147, 10, 88, 149, 11, 88, 149, 15, 88, 144, 20, 87,
				140, 19, 87, 143, 15, 87, 149, 15, 87, 149, 20, 86, 143, 21, 86, 141, 19, 87, 144, 16, 87, 147, 13, 89, 151, 16, 88, 148, 27, 86, 136,
				44, 84, 119, 113, 138, 174, 105, 146, 190, 101, 152, 195, 93, 145, 188, 100, 149, 192, 97, 144, 191, 97, 145, 195, 97, 145, 196, 100,
				146, 196, 102, 146, 195, 101, 144, 194, 100, 146, 198, 87, 141, 195, 50, 113, 171, 19, 89, 150, 9, 84, 147, 8, 85, 152, 8, 89, 158, 8,
				89, 159, 7, 86, 151, 20, 93, 152, 56, 122, 172, 71, 130, 175, 76, 132, 175, 75, 132, 176, 72, 133, 179, 67, 134, 184, 65, 134, 186,
				66, 133, 187, 68, 133, 184, 73, 132, 180, 72, 132, 182, 69, 133, 187, 69, 133, 188, 72, 132, 181, 73, 131, 179, 73, 132, 181, 72, 133,
				183, 70, 133, 185, 72, 132, 181, 86, 135, 176, 81, 114, 143, 201, 211, 233, 204, 225, 249, 198, 223, 250, 197, 224, 249, 205, 230,
				254, 200, 225, 251, 199, 226, 254, 198, 226, 255, 199, 225, 253, 202, 225, 252, 203, 226, 253, 203, 228, 254, 176, 209, 242, 107, 154,
				204, 45, 105, 164, 11, 86, 151, 4, 85, 154, 3, 87, 158, 4, 84, 152, 12, 87, 147, 50, 115, 167, 130, 183, 220, 169, 211, 238, 180, 216,
				239, 182, 217, 239, 180, 217, 242, 176, 218, 245, 175, 218, 247, 175, 218, 247, 179, 217, 246, 183, 217, 243, 182, 217, 244, 178, 218,
				247, 178, 218, 247, 181, 217, 243, 181, 216, 241, 182, 217, 243, 181, 217, 244, 179, 217, 245, 178, 216, 243, 188, 220, 242, 146, 168,
				185, 232, 232, 236, 251, 255, 255, 246, 249, 255, 250, 253, 255, 250, 253, 255, 248, 253, 255, 246, 254, 255, 246, 255, 255, 247, 254,
				255, 249, 253, 255, 250, 253, 254, 248, 253, 253, 214, 228, 242, 129, 159, 201, 50, 102, 159, 8, 83, 152, 0, 84, 158, 2, 89, 162, 5,
				86, 153, 17, 87, 144, 67, 125, 168, 175, 216, 237, 227, 250, 255, 241, 254, 255, 245, 254, 254, 244, 254, 254, 242, 255, 255, 242,
				255, 255, 243, 254, 255, 246, 254, 254, 249, 254, 253, 249, 254, 253, 246, 255, 254, 246, 255, 254, 247, 254, 254, 248, 254, 253, 247,
				254, 253, 246, 255, 254, 244, 255, 254, 240, 253, 253, 240, 252, 253, 176, 185, 189, 224, 223, 217, 255, 254, 254, 255, 248, 255, 255,
				251, 255, 255, 250, 255, 254, 251, 254, 250, 254, 255, 250, 255, 255, 251, 252, 254, 253, 251, 253, 254, 250, 249, 251, 249, 249, 218,
				226, 239, 131, 155, 193, 51, 101, 156, 6, 84, 154, 0, 85, 162, 3, 94, 167, 7, 89, 155, 15, 83, 137, 64, 116, 155, 179, 211, 234, 232,
				249, 255, 248, 252, 253, 253, 252, 250, 253, 253, 250, 252, 254, 253, 251, 254, 255, 252, 253, 254, 254, 253, 252, 255, 252, 249, 255,
				252, 249, 255, 254, 253, 254, 255, 253, 255, 253, 251, 255, 251, 249, 255, 252, 249, 255, 254, 250, 253, 254, 251, 247, 249, 248, 244,
				247, 248, 175, 179, 181, 219, 225, 213, 255, 255, 250, 255, 249, 255, 255, 250, 255, 255, 253, 253, 254, 254, 251, 250, 255, 253, 248,
				255, 254, 249, 254, 251, 253, 254, 250, 254, 253, 245, 251, 252, 246, 220, 230, 240, 134, 162, 199, 55, 109, 165, 10, 90, 161, 0, 86,
				163, 1, 92, 164, 3, 84, 149, 13, 79, 133, 65, 113, 151, 187, 217, 233, 239, 252, 255, 251, 253, 251, 254, 252, 247, 255, 253, 248,
				254, 254, 252, 253, 255, 254, 252, 255, 255, 254, 254, 254, 255, 254, 252, 255, 254, 253, 254, 255, 255, 252, 255, 255, 255, 255, 255,
				253, 253, 250, 255, 253, 249, 255, 255, 249, 255, 254, 248, 250, 249, 244, 251, 251, 250, 182, 184, 184, 233, 240, 231, 252, 255, 249,
				255, 251, 255, 255, 248, 255, 255, 253, 253, 253, 254, 250, 249, 255, 250, 248, 255, 251, 247, 253, 248, 250, 253, 248, 252, 254, 248,
				249, 253, 249, 217, 229, 239, 131, 159, 196, 50, 103, 158, 6, 87, 157, 0, 84, 160, 1, 91, 164, 10, 88, 154, 22, 84, 140, 71, 117, 157,
				191, 219, 234, 239, 250, 255, 252, 252, 251, 255, 252, 248, 255, 253, 250, 255, 253, 254, 255, 254, 255, 255, 254, 255, 255, 254, 255,
				255, 254, 255, 255, 254, 255, 254, 255, 255, 252, 255, 255, 254, 255, 254, 254, 255, 250, 255, 255, 250, 255, 254, 248, 255, 254, 248,
				252, 250, 244, 253, 252, 249, 176, 177, 175, 227, 231, 228, 254, 255, 255, 252, 249, 255, 255, 253, 255, 251, 249, 253, 253, 254, 255,
				253, 255, 252, 251, 255, 251, 249, 254, 249, 248, 255, 251, 243, 250, 253, 240, 249, 252, 218, 230, 242, 140, 163, 201, 56, 104, 157,
				1, 83, 149, 0, 88, 159, 1, 86, 160, 12, 85, 154, 26, 84, 144, 71, 112, 158, 189, 215, 234, 240, 251, 255, 251, 252, 253, 254, 250,
				250, 255, 250, 251, 255, 249, 254, 255, 249, 255, 255, 250, 255, 255, 251, 255, 255, 252, 255, 255, 253, 255, 255, 255, 253, 255, 255,
				251, 253, 254, 249, 255, 255, 250, 255, 253, 248, 252, 249, 244, 254, 253, 248, 254, 251, 247, 254, 252, 250, 183, 180, 179, 222, 224,
				224, 245, 246, 249, 255, 254, 255, 253, 252, 255, 255, 254, 255, 255, 255, 255, 252, 254, 250, 250, 254, 247, 249, 255, 249, 248, 255,
				253, 242, 252, 255, 238, 251, 255, 213, 226, 237, 131, 150, 186, 50, 94, 144, 6, 86, 150, 1, 92, 164, 9, 91, 164, 14, 82, 153, 21, 73,
				137, 63, 102, 152, 184, 210, 233, 237, 251, 255, 250, 254, 255, 254, 252, 251, 255, 251, 251, 255, 250, 253, 255, 250, 254, 255, 251,
				255, 255, 253, 255, 255, 254, 254, 255, 254, 250, 255, 255, 250, 252, 253, 247, 249, 248, 243, 254, 254, 249, 255, 255, 251, 255, 254,
				250, 255, 254, 251, 251, 248, 246, 253, 250, 249, 184, 181, 180, 224, 229, 224, 248, 249, 251, 255, 254, 255, 247, 246, 251, 254, 253,
				254, 249, 250, 247, 252, 253, 247, 249, 253, 242, 247, 254, 243, 247, 255, 248, 242, 252, 251, 241, 251, 254, 218, 229, 238, 143, 161,
				190, 64, 105, 151, 10, 82, 146, 1, 80, 156, 6, 82, 159, 16, 81, 155, 33, 84, 150, 81, 121, 171, 193, 221, 237, 231, 251, 255, 242,
				254, 253, 249, 255, 249, 251, 255, 245, 252, 255, 245, 252, 255, 246, 250, 255, 246, 249, 255, 244, 248, 255, 241, 250, 255, 243, 254,
				255, 248, 252, 254, 249, 249, 250, 245, 254, 255, 250, 254, 254, 252, 253, 253, 250, 254, 254, 252, 250, 248, 248, 251, 249, 249, 181,
				179, 180, 229, 233, 227, 251, 254, 253, 250, 252, 251, 251, 251, 252, 254, 254, 253, 254, 254, 250, 254, 255, 246, 249, 252, 239, 250,
				253, 240, 250, 255, 245, 247, 254, 250, 246, 254, 255, 216, 226, 232, 135, 151, 173, 62, 97, 133, 21, 81, 136, 13, 82, 146, 23, 84,
				152, 20, 74, 140, 26, 69, 128, 73, 108, 152, 189, 214, 234, 235, 251, 255, 245, 255, 253, 249, 255, 248, 251, 255, 246, 251, 255, 247,
				250, 255, 247, 249, 255, 246, 247, 255, 243, 246, 255, 239, 247, 255, 242, 252, 255, 250, 254, 255, 252, 252, 254, 251, 254, 255, 253,
				251, 251, 249, 249, 249, 247, 253, 253, 252, 251, 251, 251, 253, 252, 252, 182, 182, 183, 198, 204, 195, 230, 234, 229, 223, 225, 221,
				225, 227, 223, 226, 227, 222, 221, 222, 213, 226, 228, 214, 224, 228, 210, 225, 231, 212, 225, 233, 216, 222, 231, 220, 222, 231, 228,
				199, 208, 212, 135, 148, 161, 80, 105, 127, 39, 81, 114, 34, 83, 122, 46, 89, 134, 44, 81, 127, 52, 80, 122, 87, 108, 141, 179, 194,
				212, 215, 225, 230, 224, 230, 228, 228, 232, 225, 230, 231, 227, 229, 231, 230, 229, 231, 232, 228, 231, 233, 226, 232, 230, 225, 232,
				226, 225, 231, 226, 226, 231, 227, 227, 231, 230, 226, 230, 229, 231, 234, 233, 232, 234, 233, 233, 234, 233, 237, 238, 239, 231, 232,
				234, 226, 226, 229, 168, 169, 173,
			]
		),
	},
	{
		c: "gb",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				224, 105, 107, 255, 209, 207, 255, 246, 255, 251, 247, 246, 247, 253, 249, 175, 181, 193, 81, 99, 137, 28, 73, 128, 17, 76, 142, 22,
				79, 150, 18, 72, 132, 23, 91, 172, 9, 74, 156, 31, 76, 143, 34, 85, 150, 8, 75, 145, 68, 106, 151, 255, 245, 254, 205, 90, 93, 182,
				64, 52, 181, 58, 40, 196, 57, 52, 191, 51, 54, 217, 127, 129, 243, 231, 255, 55, 94, 153, 29, 76, 146, 28, 71, 150, 21, 76, 158, 13,
				81, 156, 14, 74, 144, 25, 67, 143, 26, 68, 154, 16, 75, 165, 39, 69, 105, 97, 109, 131, 219, 177, 187, 253, 144, 149, 200, 62, 62,
				173, 62, 53, 170, 107, 92, 217, 180, 164, 182, 63, 65, 180, 102, 100, 202, 178, 191, 255, 254, 253, 251, 255, 253, 246, 252, 255, 214,
				232, 255, 94, 139, 194, 27, 86, 152, 11, 68, 139, 19, 73, 133, 10, 78, 159, 7, 72, 154, 30, 75, 142, 21, 72, 137, 8, 75, 145, 66, 104,
				149, 255, 250, 255, 203, 88, 91, 183, 65, 53, 186, 63, 45, 201, 62, 57, 198, 58, 61, 208, 118, 120, 242, 230, 254, 54, 93, 152, 21,
				68, 138, 28, 71, 150, 19, 74, 156, 9, 77, 152, 15, 75, 145, 33, 75, 151, 29, 71, 157, 27, 86, 176, 140, 170, 206, 183, 195, 217, 179,
				137, 147, 174, 65, 70, 197, 59, 59, 234, 123, 114, 255, 213, 198, 255, 241, 225, 178, 116, 119, 159, 87, 88, 181, 63, 49, 216, 111,
				105, 255, 228, 219, 255, 250, 234, 250, 252, 238, 255, 251, 255, 168, 167, 198, 75, 89, 136, 52, 62, 133, 26, 73, 145, 16, 83, 153,
				13, 74, 141, 21, 72, 151, 31, 80, 159, 67, 102, 144, 245, 255, 253, 210, 94, 97, 194, 51, 43, 197, 57, 44, 191, 49, 48, 191, 46, 49,
				209, 133, 119, 224, 239, 246, 56, 97, 161, 22, 71, 147, 21, 81, 151, 11, 71, 141, 25, 74, 150, 34, 81, 153, 27, 69, 119, 74, 85, 107,
				200, 169, 175, 246, 133, 137, 196, 66, 78, 178, 62, 73, 151, 85, 86, 208, 187, 184, 255, 252, 255, 255, 248, 255, 255, 252, 255, 255,
				203, 206, 251, 179, 180, 201, 83, 69, 169, 64, 58, 160, 96, 87, 215, 198, 182, 250, 252, 238, 255, 250, 254, 252, 251, 255, 195, 209,
				255, 133, 143, 214, 27, 74, 146, 10, 77, 147, 20, 81, 148, 21, 72, 151, 23, 72, 151, 70, 105, 147, 247, 255, 255, 205, 89, 92, 200,
				57, 49, 193, 53, 40, 205, 63, 62, 200, 55, 58, 205, 129, 115, 224, 239, 246, 52, 93, 157, 28, 77, 153, 12, 72, 142, 22, 82, 152, 22,
				71, 147, 27, 74, 146, 120, 162, 212, 181, 192, 214, 176, 145, 151, 184, 71, 75, 181, 51, 63, 248, 132, 143, 255, 209, 210, 255, 245,
				242, 255, 251, 254, 249, 241, 255, 179, 176, 195, 91, 125, 173, 215, 234, 255, 247, 244, 255, 167, 134, 141, 168, 80, 78, 196, 68, 67,
				205, 95, 98, 255, 223, 221, 255, 252, 246, 255, 253, 249, 248, 255, 243, 153, 175, 189, 50, 77, 120, 42, 72, 136, 25, 71, 156, 15, 73,
				157, 77, 107, 157, 255, 248, 254, 202, 86, 95, 185, 64, 53, 194, 62, 47, 197, 53, 52, 191, 60, 52, 213, 132, 113, 239, 223, 236, 66,
				91, 157, 10, 78, 149, 26, 74, 146, 39, 69, 129, 77, 82, 114, 230, 187, 194, 255, 154, 150, 186, 61, 55, 180, 61, 55, 138, 78, 77, 210,
				192, 180, 245, 255, 242, 252, 253, 255, 254, 250, 255, 209, 230, 255, 69, 124, 180, 9, 83, 146, 40, 74, 122, 51, 70, 102, 168, 165,
				186, 252, 219, 226, 255, 168, 166, 214, 86, 85, 181, 71, 74, 153, 99, 97, 212, 199, 193, 248, 243, 239, 250, 255, 245, 238, 255, 255,
				187, 214, 255, 104, 134, 198, 26, 72, 157, 18, 76, 160, 74, 104, 154, 255, 249, 255, 210, 94, 103, 175, 54, 43, 184, 52, 37, 196, 52,
				51, 189, 58, 50, 210, 129, 110, 244, 228, 241, 67, 92, 158, 11, 79, 150, 34, 82, 154, 123, 153, 213, 194, 199, 231, 173, 130, 137,
				167, 65, 61, 184, 59, 53, 243, 124, 118, 255, 212, 211, 255, 250, 238, 249, 255, 246, 241, 242, 246, 188, 184, 211, 54, 75, 120, 20,
				75, 131, 8, 82, 145, 18, 61, 166, 18, 88, 160, 28, 72, 147, 75, 114, 183, 163, 193, 243, 212, 217, 237, 190, 140, 139, 169, 66, 59,
				190, 72, 62, 225, 121, 110, 255, 211, 209, 255, 241, 248, 255, 255, 255, 255, 250, 244, 200, 202, 215, 59, 86, 131, 73, 94, 137, 255,
				252, 255, 205, 84, 93, 196, 63, 54, 197, 73, 49, 190, 61, 40, 197, 55, 45, 213, 125, 113, 241, 235, 247, 65, 96, 150, 112, 101, 135,
				223, 187, 201, 226, 143, 139, 209, 88, 79, 176, 67, 60, 153, 94, 88, 223, 205, 203, 248, 242, 244, 255, 253, 254, 255, 250, 255, 204,
				216, 254, 79, 122, 177, 20, 77, 146, 27, 74, 152, 27, 68, 147, 30, 76, 151, 30, 73, 178, 7, 77, 149, 28, 72, 147, 25, 64, 133, 38, 68,
				118, 123, 128, 148, 255, 211, 210, 255, 153, 146, 204, 86, 76, 168, 64, 53, 162, 91, 89, 219, 192, 199, 249, 249, 251, 253, 248, 242,
				247, 249, 255, 198, 225, 255, 131, 152, 195, 253, 247, 255, 207, 86, 95, 190, 57, 48, 182, 58, 34, 184, 55, 34, 204, 62, 52, 210, 122,
				110, 254, 248, 255, 128, 159, 213, 199, 188, 222, 167, 131, 145, 155, 72, 68, 194, 73, 64, 222, 113, 106, 255, 213, 207, 255, 250,
				248, 255, 253, 255, 247, 243, 244, 191, 184, 202, 65, 77, 115, 35, 78, 133, 20, 77, 146, 28, 75, 153, 32, 73, 152, 18, 64, 139, 16,
				71, 135, 35, 71, 119, 29, 75, 134, 25, 66, 130, 35, 62, 139, 48, 66, 150, 63, 85, 160, 132, 152, 202, 220, 210, 234, 186, 143, 150,
				159, 61, 52, 179, 73, 60, 224, 132, 121, 255, 219, 215, 255, 246, 244, 255, 255, 248, 249, 245, 242, 255, 254, 255, 202, 93, 88, 213,
				49, 58, 202, 59, 61, 181, 62, 58, 195, 59, 63, 205, 121, 110, 255, 249, 230, 221, 164, 170, 200, 80, 64, 174, 71, 62, 159, 91, 88,
				224, 196, 195, 255, 246, 251, 255, 251, 255, 251, 252, 255, 203, 217, 252, 104, 128, 188, 41, 73, 132, 36, 70, 134, 42, 69, 140, 28,
				61, 132, 24, 67, 136, 28, 73, 141, 38, 75, 146, 57, 112, 176, 67, 103, 151, 55, 101, 160, 70, 111, 175, 70, 97, 174, 75, 93, 177, 72,
				94, 169, 82, 102, 152, 108, 98, 122, 228, 185, 192, 255, 166, 157, 205, 99, 86, 189, 97, 86, 158, 105, 101, 216, 198, 196, 255, 252,
				245, 255, 254, 251, 253, 251, 255, 199, 90, 85, 206, 42, 51, 199, 56, 58, 179, 60, 56, 191, 55, 59, 215, 131, 120, 255, 231, 212, 178,
				121, 127, 208, 88, 72, 211, 108, 99, 255, 225, 222, 255, 241, 240, 255, 252, 255, 255, 251, 255, 178, 179, 207, 84, 98, 133, 80, 104,
				164, 56, 88, 147, 74, 108, 172, 72, 99, 170, 70, 103, 174, 65, 108, 177, 63, 108, 176, 62, 99, 170, 255, 232, 255, 255, 241, 230, 255,
				237, 243, 255, 229, 231, 255, 242, 237, 255, 242, 231, 255, 242, 230, 255, 239, 231, 255, 240, 239, 255, 242, 244, 255, 235, 238, 255,
				234, 242, 255, 232, 239, 255, 237, 237, 255, 241, 234, 255, 242, 236, 255, 241, 239, 255, 238, 241, 203, 96, 78, 193, 56, 46, 199, 59,
				46, 195, 57, 44, 196, 50, 51, 223, 114, 119, 255, 238, 236, 255, 240, 236, 255, 236, 244, 255, 235, 236, 255, 232, 229, 255, 239, 234,
				255, 236, 229, 255, 238, 230, 255, 241, 234, 255, 239, 232, 255, 240, 234, 255, 243, 237, 255, 242, 240, 255, 242, 241, 255, 238, 241,
				255, 236, 237, 255, 234, 230, 255, 241, 230, 166, 98, 121, 158, 114, 103, 160, 103, 109, 165, 113, 115, 154, 109, 104, 157, 113, 102,
				160, 112, 100, 163, 110, 102, 155, 105, 104, 153, 111, 113, 164, 108, 111, 166, 106, 114, 169, 108, 115, 164, 104, 104, 165, 115, 108,
				152, 107, 101, 156, 108, 106, 165, 110, 113, 175, 68, 50, 192, 55, 45, 196, 56, 43, 194, 56, 43, 203, 57, 58, 177, 68, 73, 166, 108,
				106, 158, 109, 105, 163, 103, 111, 164, 108, 109, 164, 109, 106, 162, 107, 102, 164, 114, 107, 155, 108, 100, 158, 109, 102, 161, 106,
				99, 159, 112, 106, 154, 111, 105, 150, 109, 107, 156, 112, 111, 161, 106, 109, 167, 103, 104, 170, 111, 107, 158, 108, 97, 214, 58,
				46, 190, 51, 56, 194, 60, 51, 193, 56, 50, 195, 53, 51, 194, 50, 49, 201, 58, 52, 196, 53, 45, 199, 61, 51, 196, 59, 49, 196, 57, 34,
				197, 50, 40, 204, 55, 59, 190, 49, 57, 194, 59, 55, 195, 57, 44, 196, 53, 47, 197, 52, 59, 201, 52, 45, 185, 63, 50, 195, 58, 48, 199,
				50, 44, 188, 68, 54, 209, 51, 52, 200, 51, 44, 199, 57, 37, 193, 53, 52, 203, 59, 58, 197, 54, 48, 191, 52, 45, 199, 64, 58, 192, 54,
				51, 195, 56, 51, 196, 57, 52, 199, 55, 44, 192, 60, 47, 189, 57, 45, 201, 60, 51, 198, 57, 47, 186, 54, 41, 196, 60, 48, 202, 53, 47,
				210, 54, 42, 196, 57, 62, 187, 53, 44, 198, 61, 55, 202, 60, 58, 196, 52, 51, 202, 59, 53, 193, 50, 42, 191, 53, 43, 195, 58, 48, 203,
				64, 41, 203, 56, 46, 198, 49, 53, 199, 58, 66, 192, 57, 53, 197, 59, 46, 195, 52, 46, 201, 56, 63, 206, 57, 50, 184, 62, 49, 197, 60,
				50, 201, 52, 46, 179, 59, 45, 205, 47, 48, 202, 53, 46, 200, 58, 38, 193, 53, 52, 199, 55, 54, 199, 56, 50, 195, 56, 49, 189, 54, 48,
				189, 51, 48, 194, 55, 50, 197, 58, 53, 200, 56, 45, 194, 62, 49, 187, 55, 43, 195, 54, 45, 197, 56, 46, 191, 59, 46, 197, 61, 49, 198,
				49, 43, 180, 58, 43, 176, 60, 47, 200, 57, 53, 186, 49, 33, 191, 59, 34, 192, 64, 39, 189, 60, 41, 190, 57, 48, 199, 62, 56, 193, 52,
				45, 189, 48, 57, 191, 57, 56, 185, 61, 51, 182, 59, 43, 186, 57, 38, 198, 58, 41, 203, 63, 48, 192, 54, 43, 195, 54, 47, 186, 60, 48,
				195, 58, 50, 199, 55, 47, 187, 63, 51, 200, 56, 56, 178, 63, 56, 179, 68, 57, 206, 60, 47, 184, 52, 40, 193, 65, 56, 190, 53, 43, 204,
				62, 48, 195, 60, 41, 198, 66, 51, 189, 55, 46, 184, 56, 45, 198, 59, 56, 196, 56, 59, 193, 58, 64, 195, 58, 66, 196, 53, 57, 192, 59,
				54, 180, 65, 47, 186, 64, 49, 185, 69, 56, 198, 55, 51, 199, 62, 46, 199, 67, 42, 187, 59, 34, 187, 58, 39, 193, 60, 51, 196, 59, 53,
				198, 57, 50, 196, 55, 64, 194, 60, 59, 181, 57, 47, 195, 72, 56, 187, 58, 39, 197, 57, 40, 196, 56, 41, 196, 58, 47, 194, 53, 46, 189,
				63, 51, 191, 54, 46, 194, 50, 42, 189, 65, 53, 198, 54, 54, 172, 57, 50, 174, 63, 52, 202, 56, 43, 183, 51, 39, 186, 58, 49, 198, 61,
				51, 196, 54, 40, 190, 55, 36, 185, 53, 38, 196, 62, 53, 188, 60, 49, 195, 56, 53, 193, 53, 56, 193, 58, 64, 195, 58, 66, 193, 50, 54,
				187, 54, 49, 183, 68, 50, 175, 136, 137, 179, 133, 117, 184, 144, 134, 171, 126, 129, 177, 130, 146, 183, 139, 152, 178, 138, 139,
				176, 142, 132, 168, 138, 127, 167, 138, 130, 169, 142, 123, 175, 139, 123, 185, 137, 123, 186, 133, 127, 188, 138, 139, 178, 137, 143,
				178, 142, 142, 171, 137, 128, 192, 64, 61, 192, 57, 53, 196, 59, 51, 200, 59, 50, 188, 60, 51, 186, 61, 59, 174, 111, 104, 167, 105,
				110, 154, 117, 108, 169, 112, 105, 175, 112, 105, 153, 105, 103, 154, 113, 119, 161, 111, 122, 165, 109, 112, 158, 106, 95, 166, 114,
				118, 172, 104, 103, 169, 101, 92, 157, 108, 93, 155, 112, 105, 162, 107, 112, 168, 103, 111, 171, 105, 109, 255, 243, 244, 255, 243,
				227, 255, 241, 231, 255, 241, 244, 255, 239, 255, 255, 237, 250, 255, 238, 239, 255, 246, 236, 255, 245, 234, 255, 247, 239, 255, 249,
				230, 255, 246, 230, 255, 242, 228, 255, 238, 232, 255, 237, 238, 255, 241, 247, 255, 239, 239, 255, 246, 237, 216, 88, 85, 189, 54,
				50, 193, 56, 48, 199, 58, 49, 181, 53, 44, 218, 93, 91, 255, 233, 226, 255, 236, 241, 255, 239, 230, 255, 239, 232, 255, 234, 227,
				255, 241, 239, 255, 239, 245, 255, 238, 249, 255, 238, 241, 255, 241, 230, 255, 235, 239, 255, 232, 231, 255, 236, 227, 255, 242, 227,
				255, 241, 234, 255, 238, 243, 255, 235, 243, 255, 235, 239, 65, 98, 179, 77, 91, 179, 55, 100, 168, 64, 109, 176, 55, 103, 169, 61,
				101, 173, 78, 106, 180, 79, 93, 154, 103, 106, 137, 203, 200, 207, 255, 245, 246, 255, 251, 255, 255, 235, 243, 255, 201, 199, 221,
				94, 87, 207, 94, 90, 179, 125, 123, 252, 248, 247, 205, 89, 89, 195, 56, 53, 195, 61, 52, 201, 64, 56, 188, 55, 48, 196, 88, 85, 255,
				252, 246, 255, 246, 255, 254, 254, 255, 249, 244, 250, 193, 152, 156, 218, 130, 128, 218, 121, 112, 255, 214, 203, 202, 193, 196, 88,
				103, 124, 83, 112, 168, 53, 102, 161, 56, 111, 176, 61, 109, 171, 59, 101, 151, 60, 107, 151, 61, 106, 163, 62, 99, 170, 39, 72, 153,
				45, 59, 147, 33, 78, 146, 19, 64, 131, 32, 80, 146, 33, 73, 145, 38, 66, 140, 134, 148, 209, 220, 223, 254, 255, 253, 255, 255, 250,
				251, 242, 232, 241, 213, 183, 191, 165, 81, 79, 183, 56, 49, 214, 101, 97, 224, 170, 168, 255, 254, 253, 201, 85, 85, 203, 64, 61,
				188, 54, 45, 188, 51, 43, 199, 66, 59, 194, 86, 83, 255, 251, 245, 255, 247, 255, 251, 251, 255, 255, 253, 255, 255, 234, 238, 243,
				155, 153, 184, 87, 78, 157, 100, 89, 215, 206, 209, 195, 210, 231, 107, 136, 192, 35, 84, 143, 14, 69, 134, 26, 74, 136, 32, 74, 124,
				31, 78, 122, 29, 74, 131, 32, 69, 140, 4, 72, 137, 28, 77, 146, 26, 68, 144, 32, 70, 141, 43, 74, 131, 70, 91, 122, 199, 211, 211,
				247, 245, 233, 255, 252, 246, 255, 247, 253, 255, 198, 191, 207, 115, 104, 178, 68, 53, 159, 70, 62, 175, 148, 167, 170, 193, 235,
				135, 151, 187, 255, 245, 255, 199, 91, 91, 198, 56, 54, 190, 56, 45, 196, 59, 53, 196, 59, 53, 185, 88, 81, 229, 248, 246, 126, 144,
				190, 203, 230, 255, 251, 254, 255, 255, 249, 250, 252, 248, 237, 251, 232, 226, 180, 119, 126, 171, 74, 85, 228, 117, 123, 255, 208,
				218, 205, 181, 195, 74, 90, 124, 38, 71, 138, 32, 71, 162, 15, 65, 154, 25, 77, 153, 27, 72, 137, 18, 86, 151, 22, 71, 140, 35, 77,
				153, 40, 78, 149, 111, 142, 199, 208, 229, 255, 246, 255, 255, 255, 255, 244, 254, 241, 235, 211, 188, 194, 154, 81, 74, 164, 72, 61,
				213, 103, 88, 254, 165, 157, 211, 184, 203, 65, 88, 130, 84, 100, 136, 255, 248, 255, 200, 92, 92, 199, 57, 55, 189, 55, 44, 191, 54,
				48, 198, 61, 55, 195, 98, 91, 218, 237, 235, 78, 96, 142, 69, 96, 126, 199, 202, 221, 255, 248, 249, 255, 255, 244, 255, 243, 237,
				255, 223, 230, 243, 146, 157, 196, 85, 91, 149, 83, 93, 208, 184, 198, 193, 209, 243, 96, 129, 196, 38, 77, 168, 26, 76, 165, 22, 74,
				150, 23, 68, 133, 16, 75, 131, 31, 70, 145, 69, 81, 119, 180, 197, 217, 229, 249, 247, 251, 255, 246, 255, 248, 243, 255, 198, 200,
				234, 121, 125, 197, 58, 61, 166, 81, 86, 199, 160, 187, 186, 197, 243, 99, 134, 190, 27, 80, 148, 26, 84, 158, 69, 102, 153, 253, 250,
				255, 200, 92, 92, 197, 60, 54, 193, 59, 48, 194, 52, 50, 194, 55, 48, 194, 100, 88, 214, 238, 240, 53, 85, 146, 22, 72, 141, 13, 77,
				139, 97, 157, 211, 205, 235, 255, 248, 255, 255, 252, 255, 255, 250, 251, 245, 231, 222, 223, 176, 117, 109, 181, 78, 69, 255, 132,
				120, 255, 193, 184, 194, 173, 182, 70, 98, 135, 17, 72, 129, 15, 82, 150, 29, 88, 144, 87, 126, 201, 239, 251, 255, 240, 255, 255,
				241, 255, 255, 245, 253, 240, 201, 176, 171, 145, 75, 77, 183, 70, 74, 202, 63, 66, 255, 173, 178, 207, 168, 195, 52, 63, 109, 32, 67,
				123, 21, 74, 142, 17, 75, 149, 65, 98, 149, 255, 252, 255, 201, 93, 93, 192, 55, 49, 194, 60, 49, 200, 58, 56, 192, 53, 46, 188, 94,
				82, 218, 242, 244, 66, 98, 159, 30, 80, 149, 15, 79, 141, 20, 80, 134, 45, 75, 113, 178, 185, 203, 250, 254, 253, 255, 255, 250, 255,
				246, 247, 255, 238, 230, 243, 140, 131, 194, 70, 58, 165, 78, 69, 224, 203, 212, 204, 232, 255, 62, 117, 174, 8, 75, 143, 175, 196,
				191, 250, 250, 255, 244, 255, 248, 255, 247, 240, 255, 196, 188, 245, 122, 114, 185, 62, 54, 163, 76, 82, 189, 155, 182, 184, 185,
				229, 109, 149, 198, 22, 77, 142, 7, 65, 138, 34, 83, 152, 21, 75, 149, 10, 70, 143, 72, 105, 148, 255, 251, 255, 207, 95, 94, 184, 53,
				43, 193, 56, 46, 205, 59, 60, 196, 57, 50, 195, 95, 80, 224, 237, 243, 60, 90, 162, 22, 76, 150, 14, 60, 135, 31, 79, 155, 23, 81,
				154, 24, 84, 147, 122, 162, 211, 207, 228, 255, 242, 255, 255, 255, 255, 246, 250, 250, 252, 227, 217, 225, 177, 133, 134, 158, 63,
				57, 245, 126, 122, 255, 196, 202, 206, 178, 190, 239, 255, 255, 254, 254, 255, 247, 255, 251, 206, 179, 172, 173, 90, 82, 182, 59, 51,
				188, 65, 57, 255, 169, 175, 198, 164, 191, 69, 70, 114, 34, 74, 123, 16, 71, 136, 32, 90, 163, 20, 69, 138, 23, 77, 151, 20, 80, 153,
				76, 109, 152, 255, 245, 249, 205, 93, 92, 188, 57, 47, 195, 58, 48, 201, 55, 56, 193, 54, 47, 197, 97, 82, 225, 238, 244, 56, 86, 158,
				17, 71, 145, 35, 81, 156, 18, 66, 142, 15, 73, 146, 17, 77, 140, 36, 76, 125, 64, 85, 112, 171, 188, 195, 253, 253, 243, 254, 254,
				255, 255, 251, 255, 255, 232, 233, 246, 151, 145, 187, 68, 64, 158, 77, 83, 215, 187, 199, 255, 248, 223, 255, 200, 208, 244, 109,
				103, 177, 61, 61, 155, 74, 81, 186, 144, 166, 193, 191, 230, 114, 145, 199, 11, 67, 128, 19, 87, 152, 33, 69, 147, 15, 76, 156, 11,
				77, 151, 25, 69, 140, 29, 65, 153, 24, 71, 161, 73, 107, 153, 251, 255, 245, 204, 90, 89, 188, 62, 48, 197, 60, 50, 201, 51, 53, 190,
				52, 42, 198, 95, 80, 234, 237, 246, 67, 90, 166, 23, 73, 146, 25, 77, 153, 27, 78, 159, 21, 67, 152, 30, 75, 158, 24, 71, 149, 14, 66,
				142, 31, 83, 159, 120, 151, 206, 212, 238, 255, 240, 253, 255, 254, 254, 255, 255, 254, 251, 224, 214, 204, 184, 138, 125, 164, 77,
				67, 209, 175, 150, 161, 100, 108, 192, 57, 51, 192, 76, 76, 255, 190, 197, 183, 141, 163, 101, 99, 138, 37, 68, 122, 29, 85, 146, 9,
				77, 142, 34, 70, 148, 12, 73, 153, 13, 79, 153, 28, 72, 143, 31, 67, 155, 25, 72, 162, 70, 104, 150, 250, 255, 244, 204, 90, 89, 184,
				58, 44, 192, 55, 45, 204, 54, 56, 198, 60, 50, 200, 97, 82, 229, 232, 241, 63, 86, 162, 26, 76, 149, 16, 68, 144, 23, 74, 155, 22, 68,
				153, 27, 72, 155, 25, 72, 150, 24, 76, 152, 20, 72, 148, 39, 70, 125, 80, 106, 141, 181, 194, 210, 253, 253, 255, 255, 254, 251, 255,
				251, 241, 255, 234, 221, 249, 162, 152,
			]
		),
	},
	{
		c: "gr",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				14, 79, 111, 37, 113, 165, 22, 93, 155, 42, 103, 166, 38, 83, 140, 33, 64, 110, 201, 220, 252, 241, 255, 255, 216, 237, 255, 79, 111,
				149, 50, 100, 151, 22, 87, 145, 22, 98, 158, 32, 114, 174, 23, 102, 158, 13, 87, 136, 38, 103, 143, 23, 87, 125, 28, 94, 142, 31, 98,
				150, 37, 107, 158, 31, 101, 152, 26, 98, 148, 28, 102, 151, 22, 96, 145, 23, 97, 144, 25, 99, 148, 26, 100, 147, 27, 101, 148, 28,
				102, 149, 28, 100, 148, 27, 99, 147, 28, 98, 147, 27, 100, 145, 22, 100, 139, 18, 100, 137, 18, 101, 141, 23, 104, 147, 25, 104, 145,
				29, 101, 139, 38, 99, 130, 49, 97, 119, 20, 99, 142, 8, 103, 169, 0, 86, 165, 32, 110, 193, 42, 101, 181, 45, 86, 152, 202, 231, 255,
				220, 245, 255, 205, 235, 255, 72, 115, 166, 21, 85, 156, 18, 99, 180, 5, 102, 181, 0, 94, 172, 0, 92, 168, 11, 100, 168, 24, 100, 158,
				29, 102, 157, 20, 99, 156, 18, 98, 157, 20, 102, 162, 11, 93, 151, 12, 94, 154, 19, 104, 161, 13, 97, 157, 9, 95, 154, 13, 97, 157,
				15, 99, 159, 16, 100, 160, 20, 102, 162, 20, 102, 162, 21, 101, 162, 20, 100, 161, 18, 100, 158, 11, 101, 151, 6, 101, 147, 5, 101,
				151, 7, 103, 154, 11, 103, 154, 17, 99, 146, 27, 96, 135, 40, 96, 123, 47, 125, 164, 0, 93, 153, 0, 96, 162, 16, 113, 184, 26, 98,
				170, 23, 74, 129, 198, 234, 255, 233, 255, 255, 209, 244, 255, 67, 113, 149, 44, 109, 173, 3, 86, 162, 6, 104, 177, 0, 97, 166, 19,
				112, 181, 22, 103, 166, 30, 100, 151, 46, 109, 153, 46, 110, 154, 39, 106, 148, 42, 109, 152, 37, 106, 147, 40, 109, 151, 47, 116,
				157, 42, 111, 153, 42, 113, 155, 38, 107, 149, 39, 108, 150, 39, 108, 150, 41, 108, 151, 42, 109, 152, 44, 108, 152, 44, 108, 154, 43,
				107, 151, 45, 113, 152, 43, 112, 151, 41, 112, 154, 39, 112, 157, 37, 110, 155, 39, 106, 149, 47, 105, 142, 60, 107, 135, 15, 92, 136,
				6, 109, 168, 5, 113, 175, 1, 101, 163, 28, 106, 168, 30, 87, 132, 191, 225, 237, 233, 255, 255, 207, 241, 253, 67, 116, 149, 30, 101,
				163, 10, 101, 174, 5, 103, 174, 1, 99, 164, 1, 85, 145, 138, 206, 255, 180, 229, 255, 184, 226, 251, 183, 227, 252, 178, 224, 248,
				187, 231, 255, 186, 232, 255, 183, 229, 253, 179, 225, 249, 175, 221, 245, 185, 231, 255, 182, 228, 252, 181, 227, 251, 180, 226, 252,
				180, 224, 249, 181, 225, 252, 181, 225, 252, 183, 224, 252, 183, 224, 252, 181, 221, 246, 183, 223, 249, 183, 227, 254, 181, 228, 255,
				177, 224, 254, 177, 222, 253, 186, 225, 254, 200, 232, 253, 28, 101, 156, 7, 104, 173, 11, 109, 172, 24, 115, 172, 28, 103, 158, 33,
				86, 126, 206, 232, 245, 237, 255, 255, 210, 238, 255, 65, 117, 157, 24, 104, 173, 3, 100, 179, 15, 113, 188, 12, 100, 164, 15, 81,
				129, 189, 235, 255, 236, 255, 255, 246, 255, 252, 245, 255, 255, 242, 255, 255, 243, 255, 255, 242, 255, 255, 242, 255, 255, 242, 255,
				255, 242, 255, 255, 242, 255, 255, 242, 255, 255, 242, 255, 255, 242, 255, 255, 243, 255, 255, 243, 255, 255, 243, 255, 255, 243, 255,
				255, 245, 255, 255, 248, 255, 255, 247, 255, 255, 244, 255, 255, 244, 255, 255, 241, 255, 255, 239, 255, 255, 239, 255, 255, 244, 255,
				255, 41, 98, 143, 17, 90, 145, 17, 85, 134, 23, 87, 131, 43, 102, 146, 28, 73, 106, 213, 229, 244, 244, 253, 255, 223, 241, 255, 73,
				109, 145, 31, 93, 150, 20, 95, 160, 7, 79, 138, 24, 87, 140, 18, 70, 110, 196, 233, 255, 237, 255, 255, 241, 254, 255, 243, 255, 255,
				243, 255, 255, 243, 255, 255, 243, 255, 255, 243, 255, 255, 243, 255, 255, 243, 255, 255, 243, 255, 255, 241, 255, 255, 241, 255, 255,
				241, 255, 255, 241, 255, 255, 241, 255, 255, 241, 255, 255, 241, 255, 255, 241, 255, 255, 246, 255, 255, 244, 254, 255, 242, 254, 255,
				243, 255, 255, 241, 255, 255, 239, 255, 255, 241, 253, 255, 243, 255, 255, 221, 243, 255, 193, 220, 241, 204, 225, 244, 206, 228, 251,
				194, 225, 254, 203, 229, 255, 236, 244, 255, 249, 248, 255, 237, 237, 247, 218, 225, 243, 212, 229, 255, 193, 216, 247, 205, 229, 255,
				195, 222, 252, 182, 222, 255, 133, 182, 225, 124, 178, 224, 134, 188, 235, 130, 178, 226, 131, 177, 226, 131, 177, 226, 131, 177, 226,
				131, 177, 226, 131, 177, 226, 131, 177, 226, 131, 177, 226, 134, 180, 229, 134, 180, 229, 134, 180, 229, 134, 180, 229, 134, 180, 229,
				134, 180, 229, 134, 180, 229, 136, 180, 227, 139, 181, 223, 137, 179, 219, 136, 177, 221, 138, 179, 223, 140, 178, 223, 140, 176, 224,
				144, 176, 227, 150, 179, 213, 249, 253, 252, 241, 246, 249, 254, 255, 255, 243, 250, 255, 228, 248, 255, 233, 254, 255, 246, 250, 255,
				255, 253, 255, 253, 247, 251, 254, 252, 255, 240, 242, 254, 249, 253, 255, 247, 249, 255, 238, 251, 255, 230, 255, 255, 97, 145, 191,
				18, 83, 139, 12, 80, 141, 23, 85, 146, 24, 84, 144, 24, 84, 146, 24, 84, 144, 24, 84, 146, 24, 84, 144, 24, 84, 146, 24, 84, 144, 22,
				82, 144, 22, 82, 142, 22, 82, 144, 22, 82, 142, 22, 82, 144, 22, 82, 142, 22, 82, 144, 22, 82, 142, 24, 85, 140, 21, 82, 137, 20, 81,
				138, 22, 81, 139, 26, 80, 140, 28, 78, 139, 36, 77, 139, 43, 80, 124, 247, 252, 248, 249, 255, 255, 236, 243, 249, 236, 250, 255, 234,
				255, 255, 226, 252, 255, 244, 253, 255, 254, 254, 252, 250, 252, 249, 243, 248, 251, 240, 255, 255, 241, 255, 255, 234, 247, 255, 231,
				249, 255, 214, 242, 255, 113, 154, 186, 53, 102, 142, 41, 95, 141, 41, 97, 146, 40, 98, 148, 40, 97, 150, 40, 98, 148, 40, 97, 150,
				40, 98, 148, 40, 97, 150, 40, 98, 148, 38, 95, 148, 38, 96, 146, 38, 95, 148, 38, 96, 146, 38, 95, 148, 38, 96, 146, 38, 95, 148, 35,
				96, 150, 31, 100, 155, 28, 99, 155, 28, 97, 152, 31, 98, 151, 34, 97, 148, 39, 95, 146, 47, 92, 149, 57, 94, 136, 145, 167, 180, 125,
				156, 177, 136, 168, 193, 121, 156, 184, 113, 157, 186, 122, 158, 182, 222, 237, 242, 249, 255, 255, 226, 240, 241, 153, 178, 185, 131,
				169, 190, 111, 155, 180, 128, 169, 191, 143, 181, 204, 120, 156, 182, 142, 178, 202, 163, 195, 218, 158, 192, 217, 153, 192, 223, 150,
				193, 227, 150, 193, 228, 150, 193, 227, 150, 193, 228, 150, 193, 227, 150, 193, 228, 150, 193, 227, 153, 196, 231, 153, 196, 230, 153,
				196, 231, 153, 196, 230, 153, 196, 231, 153, 196, 230, 153, 196, 231, 151, 197, 233, 147, 200, 240, 142, 200, 240, 143, 199, 236, 145,
				199, 233, 148, 199, 230, 151, 196, 229, 158, 193, 235, 166, 195, 227, 24, 81, 124, 20, 96, 156, 7, 83, 143, 17, 89, 147, 37, 107, 158,
				15, 67, 104, 206, 230, 242, 236, 254, 255, 212, 242, 252, 46, 96, 121, 13, 91, 139, 5, 96, 153, 0, 81, 136, 16, 90, 139, 13, 67, 105,
				206, 240, 255, 245, 255, 255, 241, 245, 248, 245, 255, 255, 242, 255, 255, 242, 255, 255, 242, 255, 255, 242, 255, 255, 242, 255, 255,
				242, 255, 255, 242, 255, 255, 240, 255, 255, 240, 255, 255, 240, 255, 255, 240, 255, 255, 240, 255, 255, 240, 255, 255, 240, 255, 255,
				240, 255, 255, 241, 255, 255, 238, 255, 255, 238, 255, 255, 239, 255, 255, 239, 255, 255, 237, 255, 255, 240, 253, 255, 245, 255, 255,
				37, 111, 174, 7, 103, 187, 20, 112, 195, 31, 117, 192, 19, 94, 159, 39, 93, 139, 201, 224, 240, 244, 255, 255, 205, 237, 252, 70, 126,
				161, 23, 113, 175, 6, 112, 186, 17, 119, 193, 0, 87, 154, 38, 104, 156, 193, 231, 255, 238, 248, 255, 255, 254, 255, 248, 255, 255,
				245, 255, 255, 245, 255, 255, 245, 255, 255, 245, 255, 255, 245, 255, 255, 245, 255, 255, 245, 255, 255, 245, 255, 255, 245, 255, 255,
				245, 255, 255, 245, 255, 255, 245, 255, 255, 245, 255, 255, 245, 255, 255, 247, 255, 255, 248, 255, 255, 247, 255, 255, 246, 255, 255,
				247, 255, 255, 245, 255, 255, 243, 255, 255, 245, 254, 255, 247, 255, 255, 26, 100, 171, 0, 94, 184, 9, 93, 181, 28, 103, 184, 27, 91,
				162, 39, 82, 133, 214, 226, 248, 252, 254, 255, 215, 230, 249, 78, 116, 152, 24, 95, 157, 6, 96, 172, 8, 97, 177, 15, 97, 173, 12, 79,
				147, 155, 202, 255, 180, 205, 245, 191, 210, 243, 184, 213, 247, 181, 213, 251, 181, 213, 251, 181, 213, 251, 181, 213, 251, 181, 213,
				251, 181, 213, 251, 181, 213, 251, 181, 213, 251, 181, 213, 251, 181, 213, 251, 181, 213, 251, 181, 213, 251, 181, 213, 251, 181, 213,
				251, 183, 213, 249, 184, 213, 245, 185, 214, 244, 181, 212, 243, 180, 210, 244, 184, 214, 248, 183, 211, 250, 185, 210, 251, 194, 218,
				246, 60, 119, 177, 16, 92, 168, 32, 101, 179, 46, 112, 188, 56, 115, 185, 31, 72, 124, 207, 219, 245, 240, 242, 255, 230, 242, 255,
				88, 118, 154, 64, 123, 181, 12, 86, 157, 33, 109, 184, 44, 118, 193, 33, 101, 174, 33, 90, 157, 27, 69, 127, 39, 76, 129, 32, 75, 126,
				30, 76, 126, 30, 76, 126, 30, 76, 126, 30, 76, 126, 30, 76, 126, 30, 76, 126, 30, 76, 126, 30, 76, 126, 30, 76, 126, 30, 76, 126, 30,
				76, 126, 30, 76, 126, 30, 76, 126, 30, 76, 126, 30, 76, 126, 29, 77, 125, 31, 79, 127, 28, 75, 127, 27, 74, 126, 31, 77, 129, 32, 73,
				127, 35, 72, 127, 44, 79, 117, 41, 66, 97, 45, 83, 128, 31, 80, 138, 12, 67, 131, 15, 73, 136, 19, 66, 118, 206, 227, 255, 244, 255,
				255, 217, 234, 255, 57, 87, 123, 31, 83, 133, 11, 73, 132, 28, 90, 151, 1, 65, 129, 8, 75, 145, 8, 75, 145, 26, 89, 158, 22, 82, 145,
				26, 82, 139, 27, 82, 136, 27, 82, 136, 27, 82, 136, 27, 82, 136, 27, 82, 136, 27, 82, 136, 27, 82, 136, 27, 82, 136, 27, 82, 136, 27,
				82, 136, 27, 82, 136, 27, 82, 136, 27, 82, 136, 27, 82, 136, 26, 83, 138, 22, 84, 143, 22, 86, 147, 20, 84, 145, 21, 83, 142, 26, 85,
				141, 26, 81, 137, 31, 77, 136, 41, 85, 124, 173, 179, 191, 155, 172, 192, 154, 184, 218, 149, 191, 233, 147, 195, 243, 153, 195, 237,
				216, 238, 255, 236, 249, 255, 226, 243, 255, 160, 186, 211, 138, 178, 214, 145, 190, 232, 152, 195, 237, 149, 194, 236, 146, 198, 246,
				137, 192, 246, 135, 192, 247, 128, 184, 235, 141, 189, 235, 142, 190, 230, 142, 190, 230, 142, 190, 230, 142, 190, 230, 142, 190, 230,
				142, 190, 230, 142, 190, 230, 142, 190, 230, 142, 190, 230, 142, 190, 230, 142, 190, 230, 142, 190, 230, 142, 190, 230, 142, 190, 230,
				141, 190, 233, 137, 189, 237, 139, 193, 240, 137, 191, 237, 138, 191, 233, 141, 193, 232, 141, 189, 227, 143, 184, 228, 154, 189, 221,
				252, 255, 255, 241, 248, 254, 241, 254, 255, 234, 254, 255, 216, 247, 255, 229, 255, 255, 236, 245, 252, 254, 255, 255, 251, 255, 255,
				245, 255, 255, 234, 255, 255, 232, 255, 255, 223, 242, 255, 235, 253, 255, 233, 255, 255, 227, 250, 255, 228, 254, 255, 237, 255, 255,
				231, 254, 255, 232, 254, 255, 232, 254, 255, 232, 254, 255, 232, 254, 255, 232, 254, 255, 232, 254, 255, 232, 254, 255, 232, 254, 255,
				232, 254, 255, 232, 254, 255, 232, 254, 255, 232, 254, 255, 232, 254, 255, 232, 254, 255, 234, 253, 255, 235, 252, 255, 238, 254, 255,
				236, 255, 255, 235, 254, 255, 237, 255, 255, 234, 253, 255, 233, 249, 255, 242, 254, 255, 226, 243, 250, 234, 254, 255, 244, 255, 255,
				244, 255, 255, 233, 255, 255, 234, 255, 255, 245, 255, 255, 247, 252, 255, 245, 254, 255, 236, 250, 255, 234, 255, 255, 237, 255, 255,
				245, 255, 255, 240, 251, 255, 244, 255, 255, 240, 255, 255, 242, 255, 255, 232, 249, 255, 241, 255, 255, 241, 255, 255, 241, 255, 255,
				241, 255, 255, 241, 255, 255, 241, 255, 255, 241, 255, 255, 241, 255, 255, 241, 255, 255, 241, 255, 255, 241, 255, 255, 241, 255, 255,
				241, 255, 255, 241, 255, 255, 241, 255, 255, 243, 255, 255, 246, 255, 255, 247, 255, 255, 246, 255, 255, 244, 255, 255, 245, 255, 255,
				243, 255, 255, 244, 253, 255, 249, 255, 255, 191, 239, 255, 164, 219, 250, 185, 218, 237, 180, 208, 229, 172, 215, 247, 165, 208, 242,
				191, 218, 245, 194, 216, 239, 193, 217, 245, 182, 211, 241, 184, 220, 255, 171, 207, 241, 186, 212, 239, 184, 209, 231, 191, 221, 245,
				175, 209, 234, 180, 216, 240, 184, 220, 246, 183, 214, 243, 183, 214, 245, 183, 214, 245, 183, 214, 245, 183, 214, 245, 183, 214, 245,
				183, 214, 245, 183, 214, 245, 183, 214, 245, 183, 214, 245, 183, 214, 245, 183, 214, 245, 183, 214, 245, 183, 214, 245, 183, 214, 245,
				183, 214, 245, 182, 216, 244, 182, 217, 245, 180, 215, 245, 179, 214, 244, 183, 217, 245, 184, 213, 245, 186, 209, 251, 197, 216, 246,
				50, 104, 140, 52, 118, 168, 66, 114, 152, 66, 110, 147, 61, 115, 161, 58, 114, 161, 70, 113, 156, 66, 105, 146, 60, 101, 145, 69, 113,
				160, 63, 110, 162, 57, 105, 154, 71, 113, 155, 67, 109, 149, 61, 106, 147, 63, 112, 153, 59, 111, 151, 62, 111, 154, 63, 110, 156, 65,
				109, 156, 65, 109, 156, 65, 109, 156, 65, 109, 156, 65, 109, 156, 65, 109, 156, 65, 109, 156, 65, 109, 156, 65, 109, 156, 65, 109,
				156, 65, 109, 156, 65, 109, 156, 65, 109, 156, 65, 109, 156, 63, 110, 156, 62, 111, 154, 61, 112, 155, 58, 109, 156, 58, 108, 157, 63,
				110, 162, 65, 106, 160, 69, 104, 162, 84, 112, 152, 52, 86, 134, 31, 80, 146, 30, 85, 142, 27, 86, 142, 25, 87, 146, 23, 88, 146, 27,
				86, 144, 27, 86, 142, 27, 86, 144, 26, 86, 146, 25, 85, 147, 25, 85, 145, 26, 85, 143, 26, 85, 141, 25, 86, 143, 25, 86, 143, 24, 86,
				143, 25, 86, 143, 26, 85, 145, 26, 85, 145, 26, 85, 145, 26, 85, 145, 26, 85, 145, 26, 85, 145, 26, 85, 145, 26, 85, 145, 27, 86, 146,
				27, 86, 146, 27, 86, 146, 27, 86, 146, 27, 86, 146, 27, 86, 146, 27, 86, 146, 29, 85, 142, 29, 85, 136, 32, 88, 139, 27, 86, 142, 25,
				84, 144, 26, 84, 147, 28, 79, 144, 36, 77, 143, 53, 85, 132, 114, 142, 181, 105, 144, 199, 105, 151, 201, 102, 153, 200, 102, 152,
				201, 102, 153, 200, 102, 152, 201, 102, 153, 200, 102, 152, 201, 102, 153, 200, 104, 154, 203, 104, 155, 202, 104, 154, 203, 104, 155,
				202, 104, 154, 203, 104, 155, 202, 104, 154, 203, 104, 155, 202, 106, 154, 203, 106, 154, 202, 106, 154, 203, 106, 154, 202, 106, 154,
				203, 106, 154, 202, 106, 154, 203, 106, 154, 202, 103, 151, 200, 103, 151, 199, 103, 151, 200, 103, 151, 199, 103, 151, 200, 103, 151,
				199, 103, 151, 200, 103, 151, 197, 105, 152, 194, 106, 155, 195, 101, 154, 198, 97, 154, 199, 98, 154, 201, 99, 151, 201, 106, 147,
				201, 123, 155, 193, 228, 255, 255, 226, 255, 255, 224, 245, 255, 228, 244, 255, 228, 244, 255, 228, 244, 255, 228, 244, 255, 228, 244,
				255, 228, 244, 255, 228, 244, 255, 226, 242, 255, 226, 242, 255, 226, 242, 255, 226, 242, 255, 226, 242, 255, 226, 242, 255, 226, 242,
				255, 226, 242, 255, 225, 241, 255, 225, 241, 254, 225, 241, 255, 225, 241, 254, 225, 241, 255, 225, 241, 254, 225, 241, 255, 225, 241,
				254, 227, 243, 255, 227, 243, 255, 227, 243, 255, 227, 243, 255, 227, 243, 255, 227, 243, 255, 227, 243, 255, 226, 244, 255, 223, 247,
				255, 221, 251, 255, 216, 250, 255, 211, 251, 255, 211, 254, 255, 210, 250, 255, 214, 246, 255, 227, 253, 255, 225, 255, 255, 222, 254,
				255, 239, 255, 255, 245, 254, 255, 245, 254, 255, 245, 254, 255, 245, 254, 255, 245, 254, 255, 245, 254, 255, 245, 254, 255, 247, 255,
				255, 247, 255, 255, 247, 255, 255, 247, 255, 255, 247, 255, 255, 247, 255, 255, 247, 255, 255, 247, 255, 255, 246, 255, 255, 246, 255,
				255, 246, 255, 255, 246, 255, 255, 246, 255, 255, 246, 255, 255, 246, 255, 255, 246, 255, 255, 245, 254, 255, 245, 254, 255, 245, 254,
				255, 245, 254, 255, 245, 254, 255, 245, 254, 255, 245, 254, 255, 244, 255, 255, 241, 255, 255, 240, 255, 255, 233, 255, 255, 229, 255,
				255, 228, 255, 255, 228, 255, 255, 229, 255, 255, 240, 255, 255, 222, 250, 255, 212, 245, 255, 208, 238, 255, 210, 238, 255, 210, 238,
				255, 210, 238, 255, 210, 238, 255, 210, 238, 255, 210, 238, 255, 210, 238, 255, 212, 240, 255, 212, 240, 255, 212, 240, 255, 212, 240,
				255, 212, 240, 255, 212, 240, 255, 212, 240, 255, 212, 240, 255, 211, 239, 255, 211, 239, 255, 211, 239, 255, 211, 239, 255, 211, 239,
				255, 211, 239, 255, 211, 239, 255, 211, 239, 255, 211, 239, 255, 211, 239, 255, 211, 239, 255, 211, 239, 255, 211, 239, 255, 211, 239,
				255, 211, 239, 255, 213, 239, 255, 217, 235, 249, 220, 236, 249, 213, 235, 248, 210, 236, 249, 211, 240, 254, 208, 236, 255, 209, 233,
				255, 220, 239, 255, 92, 118, 153, 98, 134, 184, 93, 138, 180, 90, 139, 179, 90, 139, 179, 90, 139, 179, 90, 139, 179, 90, 139, 179,
				90, 139, 179, 90, 139, 179, 88, 137, 177, 88, 137, 177, 88, 137, 177, 88, 137, 177, 88, 137, 177, 88, 137, 177, 88, 137, 177, 88, 137,
				177, 87, 136, 176, 85, 137, 176, 87, 136, 176, 85, 137, 176, 87, 136, 176, 85, 137, 176, 87, 136, 176, 85, 137, 176, 91, 140, 180, 89,
				141, 180, 91, 140, 180, 89, 141, 180, 91, 140, 180, 89, 141, 180, 91, 140, 180, 94, 139, 178, 98, 136, 172, 103, 137, 172, 97, 135,
				172, 96, 135, 174, 98, 140, 180, 97, 136, 179, 99, 131, 178, 111, 138, 168, 63, 86, 128, 43, 81, 143, 23, 83, 143, 15, 87, 146, 15,
				87, 146, 15, 87, 146, 15, 87, 146, 15, 87, 146, 15, 87, 146, 15, 87, 146, 17, 89, 148, 17, 89, 148, 17, 89, 148, 17, 89, 148, 17, 89,
				148, 17, 89, 148, 17, 89, 148, 17, 89, 148, 17, 89, 148, 15, 90, 148, 17, 89, 148, 15, 90, 148, 17, 89, 148, 15, 90, 148, 17, 89, 148,
				15, 90, 148, 15, 87, 146, 13, 88, 146, 15, 87, 146, 13, 88, 146, 15, 87, 146, 13, 88, 146, 15, 87, 146, 13, 87, 148, 13, 86, 154, 13,
				87, 158, 11, 85, 158, 11, 85, 158, 18, 88, 160, 20, 84, 156, 24, 78, 148, 37, 83, 132, 66, 90, 118, 53, 90, 135, 47, 100, 150, 40,
				103, 154, 40, 103, 156, 40, 103, 154, 40, 103, 156, 40, 103, 154, 40, 103, 156, 40, 103, 154, 39, 102, 155, 39, 102, 153, 39, 102,
				155, 39, 102, 153, 39, 102, 155, 39, 102, 153, 39, 102, 155, 39, 102, 153, 37, 103, 155, 37, 103, 153, 37, 103, 155, 37, 103, 153, 37,
				103, 155, 37, 103, 153, 37, 103, 155, 37, 103, 153, 37, 103, 155, 37, 103, 153, 37, 103, 155, 37, 103, 153, 37, 103, 155, 37, 103,
				153, 37, 103, 155, 36, 103, 156, 33, 103, 163, 33, 104, 166, 30, 101, 165, 32, 102, 164, 40, 106, 166, 41, 102, 159, 45, 95, 154, 57,
				101, 140,
			]
		),
	},
	{
		c: "it",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				40, 75, 51, 40, 99, 71, 38, 116, 84, 29, 122, 85, 22, 123, 84, 23, 123, 84, 28, 121, 84, 32, 118, 82, 34, 117, 79, 36, 118, 78, 35,
				121, 79, 39, 123, 81, 51, 121, 85, 77, 120, 97, 131, 153, 137, 191, 193, 181, 209, 201, 189, 210, 199, 186, 209, 203, 187, 209, 209,
				192, 206, 208, 190, 207, 208, 192, 211, 202, 194, 212, 196, 192, 213, 199, 197, 214, 202, 199, 214, 197, 193, 211, 183, 179, 170, 116,
				112, 149, 67, 67, 144, 43, 47, 143, 32, 37, 143, 26, 34, 148, 24, 34, 152, 22, 34, 151, 23, 34, 144, 26, 34, 144, 26, 34, 151, 23, 35,
				156, 21, 36, 152, 23, 37, 137, 29, 38, 36, 87, 58, 41, 119, 85, 37, 138, 98, 26, 145, 101, 18, 146, 100, 18, 147, 101, 22, 145, 101,
				25, 143, 99, 28, 141, 97, 29, 142, 96, 29, 145, 97, 33, 147, 99, 46, 143, 102, 72, 141, 114, 145, 188, 170, 223, 239, 227, 250, 251,
				242, 254, 249, 240, 254, 251, 239, 255, 255, 243, 254, 255, 243, 252, 252, 243, 254, 249, 246, 255, 245, 245, 255, 246, 248, 255, 248,
				250, 255, 243, 244, 249, 222, 224, 202, 136, 141, 170, 70, 81, 166, 41, 57, 167, 26, 44, 169, 17, 37, 174, 14, 36, 177, 13, 36, 176,
				14, 36, 168, 17, 36, 166, 18, 36, 171, 15, 37, 174, 14, 38, 167, 17, 38, 151, 24, 38, 29, 91, 59, 36, 129, 91, 29, 147, 103, 16, 153,
				105, 7, 154, 105, 6, 156, 106, 8, 154, 106, 10, 152, 104, 13, 149, 101, 15, 150, 101, 15, 154, 103, 19, 155, 105, 30, 149, 106, 50,
				142, 112, 131, 194, 173, 217, 244, 235, 247, 255, 250, 253, 252, 245, 254, 251, 244, 255, 255, 247, 254, 255, 248, 251, 252, 248, 254,
				253, 253, 255, 250, 253, 255, 249, 253, 255, 248, 253, 255, 243, 248, 250, 222, 229, 207, 129, 141, 175, 59, 78, 178, 32, 57, 183, 17,
				45, 187, 8, 37, 193, 5, 36, 196, 4, 36, 194, 5, 36, 185, 8, 36, 182, 9, 36, 184, 7, 36, 184, 7, 36, 176, 11, 37, 159, 20, 38, 23, 88,
				56, 30, 130, 90, 18, 146, 100, 6, 152, 103, 0, 156, 105, 0, 157, 107, 0, 156, 107, 0, 153, 107, 3, 152, 104, 5, 151, 103, 6, 154, 105,
				10, 155, 107, 22, 152, 110, 45, 152, 119, 125, 202, 178, 211, 246, 239, 243, 255, 251, 251, 250, 246, 253, 248, 245, 255, 253, 250,
				255, 255, 252, 254, 255, 253, 254, 254, 255, 254, 251, 255, 254, 251, 255, 255, 250, 254, 255, 246, 251, 251, 227, 236, 217, 132, 148,
				187, 57, 82, 193, 31, 62, 196, 13, 47, 197, 1, 36, 203, 0, 35, 205, 0, 34, 202, 0, 34, 192, 2, 34, 188, 4, 34, 189, 2, 34, 188, 2, 34,
				179, 7, 35, 162, 18, 38, 23, 85, 56, 30, 128, 90, 15, 142, 98, 4, 151, 103, 0, 158, 108, 0, 159, 110, 0, 158, 111, 0, 154, 110, 4,
				152, 108, 6, 153, 108, 8, 154, 110, 12, 156, 112, 20, 154, 114, 39, 154, 120, 114, 201, 174, 202, 246, 234, 238, 255, 250, 250, 250,
				247, 254, 247, 246, 255, 252, 251, 255, 254, 253, 254, 255, 255, 248, 252, 254, 248, 252, 255, 250, 253, 255, 253, 251, 254, 255, 247,
				251, 251, 228, 237, 218, 130, 147, 186, 49, 75, 191, 19, 53, 198, 6, 42, 201, 0, 36, 206, 0, 35, 208, 0, 35, 204, 0, 34, 193, 2, 34,
				188, 3, 34, 189, 2, 34, 188, 2, 34, 177, 8, 35, 159, 18, 37, 27, 86, 58, 34, 130, 95, 18, 144, 102, 5, 151, 105, 0, 157, 108, 0, 158,
				110, 0, 156, 112, 0, 152, 111, 6, 150, 111, 9, 149, 110, 11, 151, 111, 14, 153, 113, 21, 153, 114, 39, 157, 121, 112, 204, 173, 203,
				246, 234, 241, 255, 250, 253, 252, 250, 255, 250, 250, 255, 250, 251, 255, 252, 252, 253, 255, 254, 250, 255, 255, 248, 255, 255, 247,
				255, 255, 250, 251, 250, 254, 243, 244, 251, 226, 232, 218, 130, 143, 189, 50, 73, 198, 22, 53, 203, 10, 44, 203, 2, 38, 207, 0, 38,
				209, 0, 38, 205, 0, 37, 195, 5, 37, 189, 6, 36, 190, 5, 36, 189, 5, 37, 177, 10, 37, 156, 19, 37, 26, 85, 57, 34, 130, 95, 18, 145,
				104, 5, 151, 107, 0, 156, 110, 0, 157, 112, 0, 155, 114, 4, 151, 113, 9, 148, 113, 13, 147, 112, 16, 148, 113, 20, 150, 114, 25, 151,
				113, 39, 155, 118, 111, 200, 168, 206, 245, 234, 243, 254, 247, 253, 252, 248, 255, 250, 248, 255, 249, 248, 255, 253, 251, 254, 255,
				253, 249, 255, 255, 245, 255, 253, 244, 255, 252, 249, 254, 251, 255, 249, 246, 250, 227, 226, 213, 130, 136, 189, 52, 69, 197, 24,
				51, 200, 12, 43, 199, 3, 38, 201, 0, 36, 204, 0, 36, 203, 1, 38, 192, 6, 37, 186, 7, 35, 187, 5, 35, 187, 5, 36, 176, 11, 37, 155, 20,
				37, 23, 84, 57, 32, 131, 96, 17, 145, 105, 4, 151, 107, 0, 156, 110, 0, 157, 113, 1, 155, 115, 5, 151, 114, 11, 147, 113, 15, 146,
				112, 18, 147, 114, 22, 149, 115, 27, 150, 113, 42, 153, 116, 111, 198, 165, 209, 245, 232, 245, 254, 245, 254, 252, 245, 255, 249,
				246, 255, 249, 246, 255, 253, 251, 253, 255, 252, 248, 255, 253, 243, 255, 251, 241, 255, 250, 247, 255, 250, 255, 251, 244, 250, 228,
				223, 210, 131, 132, 188, 54, 66, 195, 26, 47, 198, 13, 41, 197, 4, 37, 198, 0, 35, 201, 0, 35, 201, 3, 38, 190, 7, 37, 185, 7, 35,
				186, 4, 35, 187, 5, 36, 177, 11, 37, 157, 20, 38, 19, 86, 58, 29, 133, 97, 15, 147, 105, 3, 153, 107, 0, 157, 110, 0, 158, 113, 0,
				155, 115, 4, 151, 114, 10, 147, 112, 14, 146, 112, 17, 147, 114, 21, 149, 115, 29, 149, 113, 45, 151, 114, 115, 195, 164, 212, 245,
				231, 247, 253, 244, 254, 251, 245, 255, 249, 245, 255, 249, 245, 255, 254, 250, 252, 255, 251, 248, 255, 253, 242, 255, 250, 241, 255,
				249, 247, 255, 248, 255, 252, 242, 250, 229, 221, 208, 132, 129, 185, 55, 63, 192, 28, 44, 197, 14, 39, 196, 4, 36, 198, 0, 35, 201,
				0, 35, 202, 2, 38, 192, 6, 37, 186, 6, 35, 189, 3, 35, 189, 3, 36, 181, 10, 37, 161, 19, 38, 16, 88, 58, 27, 135, 98, 13, 149, 106, 2,
				154, 108, 0, 158, 110, 0, 159, 113, 0, 156, 114, 2, 152, 113, 7, 148, 111, 12, 147, 111, 14, 149, 113, 19, 151, 114, 29, 149, 112, 49,
				150, 113, 121, 193, 163, 216, 244, 231, 249, 253, 244, 255, 251, 245, 255, 250, 245, 255, 250, 246, 255, 254, 250, 252, 255, 251, 248,
				255, 253, 242, 255, 251, 242, 255, 249, 248, 255, 247, 255, 252, 241, 250, 230, 220, 208, 133, 128, 183, 57, 62, 190, 30, 43, 196, 15,
				38, 197, 4, 36, 200, 0, 35, 204, 0, 35, 204, 2, 38, 194, 5, 37, 189, 4, 35, 192, 2, 35, 193, 2, 36, 185, 8, 37, 166, 16, 38, 15, 89,
				58, 27, 135, 98, 12, 149, 106, 2, 155, 107, 0, 159, 110, 0, 159, 112, 0, 157, 113, 1, 153, 112, 5, 150, 111, 9, 149, 110, 11, 151,
				111, 17, 152, 113, 29, 149, 111, 51, 149, 113, 124, 191, 163, 217, 244, 231, 249, 252, 245, 255, 251, 246, 255, 250, 247, 255, 251,
				248, 254, 255, 251, 251, 255, 252, 248, 255, 254, 244, 255, 251, 244, 255, 250, 250, 255, 248, 255, 251, 241, 250, 229, 220, 208, 133,
				127, 182, 58, 62, 189, 30, 43, 195, 15, 38, 197, 4, 35, 200, 0, 35, 205, 0, 35, 205, 1, 38, 196, 4, 37, 191, 3, 35, 194, 1, 35, 195,
				1, 36, 187, 6, 38, 169, 15, 39, 17, 89, 59, 28, 135, 98, 13, 149, 106, 2, 154, 107, 0, 158, 108, 0, 159, 110, 0, 158, 111, 0, 154,
				110, 3, 152, 109, 7, 151, 108, 8, 153, 110, 13, 154, 111, 28, 150, 110, 54, 147, 115, 126, 189, 164, 218, 243, 233, 248, 253, 247,
				254, 252, 249, 255, 251, 250, 255, 251, 250, 253, 255, 253, 249, 255, 255, 249, 255, 255, 246, 254, 254, 248, 254, 253, 253, 254, 250,
				255, 248, 243, 250, 226, 221, 209, 132, 128, 182, 57, 63, 187, 30, 44, 195, 15, 39, 197, 4, 36, 200, 0, 35, 205, 0, 35, 205, 1, 38,
				197, 3, 37, 192, 3, 35, 195, 1, 35, 196, 1, 36, 188, 6, 38, 170, 15, 39, 22, 87, 59, 34, 133, 98, 19, 147, 107, 5, 152, 107, 0, 156,
				108, 0, 158, 110, 0, 157, 111, 1, 154, 108, 3, 152, 107, 6, 152, 107, 6, 154, 109, 12, 155, 110, 27, 151, 110, 55, 146, 115, 128, 188,
				167, 218, 243, 235, 247, 254, 250, 253, 253, 251, 255, 253, 253, 254, 253, 253, 251, 255, 255, 248, 255, 255, 250, 255, 255, 250, 253,
				255, 252, 252, 254, 255, 252, 251, 255, 246, 244, 250, 225, 222, 211, 131, 130, 183, 56, 64, 188, 30, 45, 194, 15, 40, 196, 5, 36,
				199, 0, 35, 203, 0, 35, 203, 2, 38, 196, 4, 37, 191, 4, 35, 194, 1, 35, 195, 2, 36, 187, 7, 38, 169, 17, 39, 29, 83, 59, 40, 129, 99,
				26, 143, 107, 10, 149, 107, 2, 153, 108, 1, 155, 109, 2, 154, 109, 4, 153, 108, 6, 151, 107, 7, 151, 106, 8, 154, 107, 13, 155, 109,
				27, 151, 111, 55, 145, 118, 128, 188, 171, 216, 243, 239, 243, 255, 253, 251, 255, 254, 253, 254, 255, 251, 254, 255, 249, 255, 255,
				248, 255, 255, 252, 254, 255, 253, 251, 255, 254, 249, 255, 255, 249, 253, 255, 244, 247, 251, 222, 226, 215, 128, 133, 184, 55, 66,
				188, 29, 46, 193, 16, 40, 194, 6, 36, 197, 1, 35, 201, 0, 35, 201, 3, 38, 193, 6, 37, 188, 5, 35, 190, 3, 35, 191, 3, 36, 183, 9, 38,
				164, 19, 39, 32, 83, 60, 43, 128, 99, 28, 143, 106, 10, 149, 106, 2, 153, 107, 1, 155, 108, 3, 154, 109, 5, 152, 107, 7, 150, 105, 8,
				151, 104, 8, 154, 105, 13, 155, 108, 27, 151, 110, 53, 146, 118, 126, 189, 171, 214, 243, 239, 243, 255, 254, 251, 254, 255, 254, 254,
				255, 252, 253, 255, 250, 255, 255, 250, 255, 255, 253, 254, 255, 254, 250, 255, 255, 249, 255, 255, 248, 254, 255, 243, 249, 251, 221,
				227, 215, 127, 135, 184, 55, 68, 188, 29, 47, 192, 16, 40, 193, 6, 36, 196, 1, 35, 200, 0, 35, 202, 2, 38, 195, 5, 37, 190, 4, 35,
				191, 2, 35, 190, 3, 36, 181, 10, 38, 162, 20, 40, 31, 87, 63, 37, 129, 97, 22, 145, 105, 7, 152, 107, 1, 156, 108, 0, 157, 108, 2,
				155, 108, 4, 154, 108, 6, 152, 105, 7, 152, 103, 7, 155, 103, 12, 156, 106, 25, 153, 108, 49, 151, 115, 121, 192, 167, 212, 244, 236,
				244, 253, 251, 253, 252, 252, 255, 251, 253, 254, 251, 254, 253, 253, 255, 252, 253, 255, 254, 254, 255, 252, 251, 255, 252, 251, 255,
				254, 251, 255, 255, 246, 250, 250, 224, 229, 212, 129, 137, 183, 55, 70, 189, 29, 49, 194, 15, 41, 195, 5, 36, 199, 1, 35, 202, 0, 35,
				204, 1, 36, 201, 2, 36, 200, 1, 35, 200, 0, 35, 196, 2, 36, 184, 8, 39, 164, 20, 41, 29, 93, 67, 30, 130, 96, 16, 146, 104, 4, 155,
				108, 0, 159, 109, 0, 159, 108, 0, 157, 107, 3, 156, 109, 6, 154, 105, 7, 153, 102, 7, 155, 102, 12, 157, 104, 24, 156, 107, 45, 155,
				113, 116, 195, 164, 211, 245, 232, 246, 252, 247, 254, 250, 249, 255, 248, 251, 255, 247, 252, 255, 251, 255, 254, 251, 255, 254, 254,
				255, 248, 253, 255, 247, 253, 255, 251, 254, 255, 255, 249, 252, 250, 227, 230, 209, 131, 137, 183, 55, 71, 189, 28, 51, 194, 14, 41,
				196, 5, 35, 200, 2, 34, 202, 1, 34, 205, 0, 33, 207, 0, 35, 209, 0, 35, 208, 0, 36, 201, 1, 38, 187, 6, 40, 165, 18, 42, 32, 94, 68,
				32, 131, 97, 17, 147, 105, 5, 155, 108, 0, 159, 109, 0, 159, 108, 0, 157, 107, 4, 156, 109, 7, 153, 105, 9, 152, 102, 10, 154, 102,
				14, 156, 104, 24, 156, 106, 43, 156, 113, 114, 196, 163, 211, 245, 232, 246, 252, 246, 254, 249, 248, 255, 247, 250, 255, 247, 252,
				255, 250, 255, 255, 251, 255, 252, 254, 255, 247, 254, 255, 245, 254, 255, 250, 255, 255, 255, 250, 252, 250, 228, 230, 208, 131, 137,
				183, 55, 71, 189, 28, 51, 192, 16, 41, 190, 8, 35, 193, 6, 34, 195, 3, 34, 199, 1, 33, 205, 0, 35, 207, 0, 35, 206, 0, 37, 200, 2, 38,
				185, 7, 40, 162, 19, 42, 40, 93, 69, 39, 131, 99, 23, 146, 106, 8, 153, 108, 1, 157, 109, 0, 156, 108, 1, 155, 108, 7, 154, 109, 12,
				151, 107, 13, 149, 104, 14, 151, 104, 19, 154, 105, 28, 153, 108, 46, 154, 115, 115, 195, 164, 211, 245, 233, 245, 252, 247, 254, 250,
				249, 255, 248, 251, 255, 248, 253, 255, 252, 255, 253, 252, 255, 251, 254, 255, 246, 254, 255, 246, 254, 255, 250, 254, 255, 255, 249,
				251, 250, 226, 230, 210, 129, 137, 185, 54, 71, 189, 29, 51, 187, 18, 41, 180, 13, 36, 180, 12, 35, 182, 10, 34, 186, 6, 33, 193, 2,
				35, 197, 0, 35, 197, 0, 37, 191, 3, 38, 177, 11, 40, 157, 22, 42, 45, 94, 72, 43, 130, 100, 26, 144, 106, 10, 152, 108, 2, 156, 109,
				0, 156, 108, 2, 154, 108, 8, 153, 110, 13, 150, 108, 15, 148, 106, 16, 150, 105, 21, 152, 108, 30, 152, 111, 47, 152, 117, 117, 194,
				166, 211, 244, 234, 245, 253, 248, 253, 251, 249, 255, 250, 251, 255, 250, 253, 255, 254, 255, 250, 253, 255, 249, 255, 255, 246, 254,
				255, 246, 254, 255, 251, 254, 254, 255, 248, 250, 250, 225, 228, 212, 129, 137, 188, 53, 70, 190, 28, 50, 185, 19, 41, 178, 14, 36,
				177, 13, 35, 179, 11, 34, 181, 9, 33, 188, 5, 35, 192, 2, 36, 192, 2, 37, 187, 5, 38, 174, 13, 40, 154, 24, 42, 46, 97, 72, 44, 132,
				99, 24, 145, 105, 8, 153, 107, 1, 157, 109, 0, 157, 108, 1, 155, 110, 6, 155, 110, 11, 151, 109, 12, 149, 107, 14, 150, 108, 20, 153,
				110, 29, 152, 113, 49, 151, 119, 119, 193, 169, 211, 244, 236, 243, 253, 249, 252, 252, 251, 255, 251, 253, 254, 252, 254, 252, 255,
				255, 247, 255, 255, 248, 255, 255, 246, 253, 255, 248, 254, 255, 252, 253, 254, 255, 247, 250, 251, 224, 228, 215, 128, 136, 189, 52,
				70, 192, 27, 50, 188, 18, 41, 181, 13, 36, 180, 12, 35, 181, 10, 35, 184, 7, 35, 189, 4, 36, 192, 2, 36, 191, 3, 37, 186, 6, 38, 173,
				13, 40, 153, 24, 42, 44, 100, 73, 41, 134, 98, 20, 146, 103, 5, 154, 106, 0, 159, 109, 0, 159, 108, 0, 157, 109, 2, 156, 111, 7, 152,
				109, 9, 151, 108, 11, 152, 109, 17, 154, 112, 29, 152, 114, 51, 150, 120, 121, 191, 171, 212, 244, 238, 242, 254, 251, 251, 253, 252,
				255, 253, 253, 254, 253, 254, 250, 255, 255, 246, 255, 255, 248, 255, 255, 247, 253, 255, 250, 253, 255, 254, 252, 254, 255, 246, 248,
				251, 224, 227, 216, 127, 136, 189, 52, 70, 193, 26, 50, 193, 15, 41, 189, 9, 36, 189, 7, 35, 189, 6, 36, 190, 4, 35, 193, 2, 36, 194,
				1, 36, 193, 1, 37, 188, 5, 38, 175, 13, 40, 156, 24, 42, 40, 103, 73, 35, 137, 97, 15, 148, 101, 3, 156, 104, 0, 161, 108, 0, 161,
				108, 0, 159, 108, 1, 158, 111, 4, 154, 109, 5, 152, 108, 7, 154, 109, 14, 155, 112, 28, 153, 115, 54, 149, 122, 124, 189, 172, 213,
				244, 239, 242, 254, 252, 251, 254, 252, 254, 255, 253, 252, 254, 254, 247, 255, 255, 244, 255, 255, 247, 255, 255, 248, 253, 255, 251,
				252, 255, 255, 251, 253, 255, 246, 248, 251, 223, 227, 215, 127, 136, 187, 53, 70, 193, 26, 50, 200, 12, 42, 202, 3, 37, 203, 2, 36,
				201, 2, 36, 200, 1, 36, 201, 0, 36, 201, 0, 36, 198, 0, 37, 191, 3, 38, 179, 11, 40, 159, 23, 43, 37, 106, 71, 32, 139, 95, 11, 148,
				98, 1, 156, 102, 0, 162, 106, 0, 162, 107, 0, 160, 108, 0, 159, 110, 2, 155, 109, 3, 153, 108, 5, 154, 109, 12, 156, 113, 29, 152,
				116, 57, 147, 122, 128, 187, 172, 216, 243, 238, 243, 254, 251, 250, 254, 252, 252, 255, 253, 249, 255, 254, 244, 255, 255, 242, 255,
				255, 247, 255, 255, 248, 252, 255, 252, 252, 255, 255, 251, 253, 255, 245, 248, 250, 223, 227, 214, 128, 136, 184, 55, 70, 192, 27,
				50, 204, 10, 42, 211, 0, 38, 214, 0, 37, 211, 0, 37, 208, 0, 36, 207, 0, 36, 206, 0, 36, 202, 0, 37, 194, 3, 38, 180, 11, 40, 161, 22,
				43, 39, 105, 70, 33, 136, 93, 14, 147, 96, 3, 155, 100, 0, 160, 104, 0, 160, 105, 1, 157, 106, 2, 156, 108, 6, 153, 108, 8, 152, 107,
				10, 153, 109, 17, 154, 112, 33, 149, 114, 62, 144, 122, 136, 188, 174, 220, 243, 237, 245, 254, 250, 250, 254, 250, 250, 255, 251,
				248, 255, 252, 244, 255, 254, 241, 254, 253, 247, 255, 254, 250, 253, 255, 253, 251, 253, 255, 249, 251, 255, 245, 247, 250, 225, 227,
				212, 131, 137, 178, 57, 69, 188, 31, 51, 202, 12, 43, 211, 0, 38, 215, 0, 37, 210, 0, 37, 207, 1, 37, 205, 1, 37, 202, 1, 37, 198, 1,
				37, 190, 4, 39, 176, 12, 40, 159, 23, 43, 46, 104, 70, 37, 129, 87, 25, 145, 96, 12, 152, 99, 3, 154, 100, 2, 155, 101, 6, 151, 102,
				10, 149, 104, 16, 147, 105, 19, 147, 106, 21, 149, 109, 26, 149, 111, 39, 142, 110, 68, 138, 118, 153, 196, 183, 226, 244, 238, 250,
				255, 250, 250, 253, 247, 247, 253, 246, 247, 255, 249, 243, 255, 250, 235, 251, 244, 246, 253, 250, 253, 254, 254, 253, 247, 248, 253,
				244, 244, 255, 246, 246, 250, 229, 228, 213, 140, 142, 166, 57, 65, 183, 40, 55, 197, 21, 48, 201, 3, 38, 205, 1, 39, 199, 2, 40, 196,
				4, 40, 194, 4, 40, 190, 5, 39, 187, 6, 39, 180, 9, 39, 168, 17, 40, 154, 28, 44, 59, 100, 70, 51, 123, 86, 41, 137, 94, 30, 145, 98,
				23, 149, 100, 22, 149, 101, 26, 145, 101, 31, 143, 103, 36, 141, 105, 39, 142, 107, 40, 144, 109, 44, 144, 110, 53, 137, 109, 72, 129,
				110, 147, 182, 168, 215, 230, 221, 245, 249, 241, 252, 253, 244, 251, 254, 244, 249, 255, 247, 245, 255, 248, 243, 255, 247, 252, 254,
				251, 255, 253, 253, 254, 246, 247, 254, 243, 242, 255, 241, 240, 249, 219, 216, 201, 137, 135, 155, 60, 63, 163, 37, 49, 175, 23, 43,
				180, 12, 38, 182, 11, 39, 176, 13, 40, 172, 14, 39, 171, 14, 39, 170, 14, 38, 168, 15, 38, 163, 17, 38, 154, 23, 39, 142, 32, 43, 71,
				89, 65, 62, 107, 77, 52, 119, 83, 42, 125, 85, 35, 127, 86, 35, 126, 87, 40, 123, 88, 45, 121, 88, 50, 119, 91, 52, 119, 92, 51, 121,
				94, 53, 122, 95, 60, 120, 96, 79, 122, 104, 131, 158, 144, 184, 192, 181, 209, 206, 196, 214, 211, 200, 212, 213, 200, 210, 216, 202,
				206, 217, 203, 205, 214, 202, 214, 212, 207, 217, 209, 207, 217, 206, 205, 220, 205, 203, 224, 204, 200, 217, 185, 180, 179, 128, 122,
				152, 72, 70, 154, 53, 56, 155, 40, 48, 154, 32, 43, 153, 32, 44, 147, 34, 44, 144, 35, 44, 144, 35, 44, 145, 33, 43, 146, 32, 43, 145,
				33, 43, 139, 36, 43, 129, 40, 45,
			]
		),
	},
	{
		c: "ie",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				0, 148, 100, 0, 161, 106, 0, 155, 106, 0, 155, 106, 0, 155, 106, 0, 155, 106, 0, 155, 106, 0, 155, 106, 0, 154, 105, 0, 154, 105, 2,
				149, 104, 0, 154, 105, 1, 154, 107, 4, 141, 99, 245, 255, 255, 255, 254, 255, 255, 253, 255, 251, 255, 255, 255, 254, 255, 255, 254,
				255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 247, 255, 255, 249, 240, 235, 193,
				119, 223, 176, 58, 218, 178, 28, 230, 170, 48, 228, 174, 48, 228, 177, 50, 228, 170, 47, 228, 170, 47, 229, 171, 48, 229, 171, 48,
				229, 171, 48, 228, 170, 47, 228, 170, 47, 228, 170, 47, 6, 154, 106, 0, 156, 101, 0, 153, 104, 0, 153, 104, 0, 154, 105, 0, 154, 105,
				0, 154, 105, 0, 153, 104, 0, 153, 104, 0, 153, 104, 3, 150, 105, 0, 153, 104, 0, 152, 105, 14, 151, 109, 240, 254, 254, 255, 253, 255,
				255, 253, 255, 250, 255, 255, 254, 253, 255, 254, 253, 255, 254, 253, 255, 254, 253, 255, 254, 253, 255, 254, 253, 255, 253, 252, 255,
				253, 252, 255, 255, 245, 255, 255, 251, 242, 229, 187, 113, 221, 174, 56, 220, 180, 30, 230, 170, 48, 224, 170, 44, 220, 169, 42, 230,
				172, 49, 230, 172, 49, 231, 173, 50, 231, 173, 50, 231, 173, 50, 230, 172, 49, 230, 172, 49, 230, 172, 49, 4, 158, 108, 0, 155, 99, 1,
				152, 101, 2, 153, 102, 2, 153, 102, 2, 153, 102, 2, 153, 102, 2, 153, 102, 2, 153, 102, 1, 152, 101, 4, 152, 102, 0, 154, 101, 1, 158,
				105, 0, 156, 102, 255, 253, 255, 254, 252, 253, 255, 254, 255, 251, 255, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254,
				255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 254, 255, 253, 255, 255, 239, 227, 188, 95, 222, 171, 44, 223, 177,
				30, 234, 168, 46, 231, 171, 47, 230, 172, 46, 226, 170, 49, 226, 170, 49, 226, 170, 49, 226, 170, 49, 226, 170, 49, 226, 170, 49, 226,
				170, 49, 226, 170, 49, 0, 153, 103, 0, 155, 99, 1, 152, 101, 1, 152, 101, 1, 152, 101, 1, 152, 101, 1, 152, 101, 1, 152, 101, 1, 152,
				101, 1, 152, 101, 3, 151, 101, 0, 153, 100, 0, 156, 103, 0, 150, 96, 255, 253, 255, 254, 252, 253, 255, 254, 255, 251, 255, 255, 255,
				253, 254, 255, 253, 254, 255, 253, 254, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 250, 252, 249, 255,
				255, 239, 226, 187, 94, 223, 172, 45, 224, 178, 31, 234, 168, 46, 231, 171, 47, 230, 172, 46, 227, 171, 50, 227, 171, 50, 227, 171,
				50, 227, 171, 50, 227, 171, 50, 227, 171, 50, 227, 171, 50, 227, 171, 50, 2, 150, 102, 4, 150, 101, 0, 153, 99, 0, 153, 99, 0, 153,
				99, 0, 153, 99, 0, 153, 99, 0, 153, 99, 0, 153, 99, 0, 153, 99, 0, 156, 99, 0, 156, 99, 0, 153, 99, 0, 159, 100, 255, 251, 252, 251,
				255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255,
				255, 253, 255, 255, 253, 254, 255, 255, 255, 254, 255, 233, 185, 101, 230, 168, 57, 227, 171, 48, 236, 165, 57, 228, 166, 53, 230,
				171, 53, 229, 171, 45, 229, 171, 45, 229, 171, 45, 229, 171, 45, 229, 171, 45, 229, 171, 45, 229, 171, 45, 229, 171, 45, 2, 150, 102,
				4, 150, 101, 0, 153, 99, 0, 153, 99, 0, 153, 99, 0, 153, 99, 0, 153, 99, 0, 153, 99, 0, 153, 99, 0, 153, 99, 0, 156, 99, 0, 156, 99,
				0, 153, 99, 0, 159, 100, 255, 251, 252, 251, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255,
				255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 254, 255, 255, 255, 254, 255, 233, 185, 101, 230, 168, 57, 227,
				171, 48, 236, 165, 57, 228, 166, 53, 230, 171, 53, 229, 171, 45, 229, 171, 45, 229, 171, 45, 229, 171, 45, 229, 171, 45, 229, 171, 45,
				229, 171, 45, 229, 171, 45, 0, 155, 102, 0, 154, 101, 0, 153, 99, 0, 153, 99, 0, 153, 99, 0, 153, 99, 0, 153, 99, 0, 153, 99, 0, 153,
				99, 0, 153, 99, 0, 154, 99, 1, 152, 99, 8, 148, 99, 0, 154, 100, 255, 253, 252, 249, 255, 253, 255, 255, 253, 255, 253, 253, 254, 255,
				253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 251, 255, 255, 255, 254,
				253, 233, 188, 87, 230, 171, 43, 223, 174, 45, 230, 169, 52, 222, 169, 55, 225, 172, 58, 231, 169, 46, 231, 169, 46, 231, 169, 46,
				231, 169, 46, 231, 169, 46, 231, 169, 46, 231, 169, 46, 231, 169, 46, 0, 155, 102, 0, 154, 101, 0, 153, 99, 0, 153, 99, 0, 153, 99, 0,
				153, 99, 0, 153, 99, 0, 153, 99, 0, 153, 99, 0, 153, 99, 0, 154, 99, 1, 152, 99, 8, 148, 99, 0, 154, 100, 255, 253, 252, 249, 255,
				253, 255, 255, 253, 255, 253, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255,
				253, 254, 255, 253, 251, 255, 255, 255, 254, 253, 233, 188, 87, 230, 171, 43, 223, 174, 45, 230, 169, 52, 222, 169, 55, 225, 172, 58,
				231, 169, 46, 231, 169, 46, 231, 169, 46, 231, 169, 46, 231, 169, 46, 231, 169, 46, 231, 169, 46, 231, 169, 46, 0, 155, 101, 7, 149,
				101, 0, 152, 101, 0, 152, 101, 0, 152, 101, 0, 152, 101, 0, 152, 101, 0, 152, 101, 0, 152, 101, 0, 152, 101, 0, 155, 101, 0, 156, 101,
				0, 154, 101, 1, 153, 102, 250, 255, 254, 254, 255, 255, 255, 254, 255, 255, 254, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255,
				254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 244, 255, 252, 255, 238, 185, 91, 233, 167, 55,
				224, 171, 59, 231, 168, 52, 227, 169, 43, 231, 174, 33, 226, 172, 50, 226, 172, 50, 226, 172, 50, 226, 172, 50, 226, 172, 50, 226,
				172, 50, 226, 172, 50, 226, 172, 50, 0, 155, 101, 7, 149, 101, 0, 152, 101, 0, 152, 101, 0, 152, 101, 0, 152, 101, 0, 152, 101, 0,
				152, 101, 0, 152, 101, 0, 152, 101, 0, 155, 101, 0, 156, 101, 0, 154, 101, 1, 153, 102, 250, 255, 254, 254, 255, 255, 255, 254, 255,
				255, 254, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255,
				254, 255, 244, 255, 252, 255, 238, 185, 91, 233, 167, 55, 224, 171, 59, 231, 168, 52, 227, 169, 43, 231, 174, 33, 226, 172, 50, 226,
				172, 50, 226, 172, 50, 226, 172, 50, 226, 172, 50, 226, 172, 50, 226, 172, 50, 226, 172, 50, 0, 157, 101, 0, 153, 101, 0, 154, 103, 0,
				154, 103, 0, 154, 103, 0, 154, 103, 0, 154, 103, 0, 154, 103, 0, 154, 103, 0, 154, 103, 7, 149, 103, 0, 154, 103, 0, 154, 103, 7, 150,
				104, 250, 255, 255, 255, 252, 255, 255, 253, 255, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 249, 255, 255, 255, 252, 255, 233, 189, 82, 229, 172, 41, 222, 174, 48, 227, 171,
				48, 225, 168, 52, 231, 171, 51, 230, 170, 48, 230, 170, 48, 230, 170, 48, 230, 170, 48, 230, 170, 48, 230, 170, 48, 230, 170, 48, 230,
				170, 48, 0, 157, 101, 0, 153, 101, 0, 154, 103, 0, 154, 103, 0, 154, 103, 0, 154, 103, 0, 154, 103, 0, 154, 103, 0, 154, 103, 0, 154,
				103, 7, 149, 103, 0, 154, 103, 0, 154, 103, 7, 150, 104, 250, 255, 255, 255, 252, 255, 255, 253, 255, 251, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 249, 255, 255, 255, 252, 255,
				233, 189, 82, 229, 172, 41, 222, 174, 48, 227, 171, 48, 225, 168, 52, 231, 171, 51, 230, 170, 48, 230, 170, 48, 230, 170, 48, 230,
				170, 48, 230, 170, 48, 230, 170, 48, 230, 170, 48, 230, 170, 48, 0, 154, 103, 0, 152, 100, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0,
				153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 154, 101, 1, 152, 101, 0, 155, 102, 255, 253, 254, 252,
				255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 252, 255, 253, 255, 254, 255, 238, 185, 89, 226, 172, 46, 230, 170, 48, 227, 171, 48, 228, 167, 50, 228, 172,
				49, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 0, 154, 103, 0,
				152, 100, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 154,
				101, 1, 152, 101, 0, 155, 102, 255, 253, 254, 252, 255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 255, 253, 255, 254, 255, 238, 185, 89, 226, 172,
				46, 230, 170, 48, 227, 171, 48, 228, 167, 50, 228, 172, 49, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229,
				171, 48, 229, 171, 48, 229, 171, 48, 0, 155, 104, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0,
				153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 154, 101, 1, 152, 101, 0, 155, 102, 255, 253, 254, 252, 255, 255, 255, 254, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				252, 255, 253, 255, 254, 255, 238, 185, 89, 226, 172, 46, 230, 170, 48, 227, 171, 48, 228, 167, 50, 228, 172, 49, 229, 171, 48, 229,
				171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 0, 155, 104, 0, 153, 101, 0, 153, 101, 0,
				153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 154, 101, 1, 152, 101, 0, 155,
				102, 255, 253, 254, 252, 255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 255, 253, 255, 254, 255, 238, 185, 89, 226, 172, 46, 230, 170, 48, 227, 171,
				48, 228, 167, 50, 228, 172, 49, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229,
				171, 48, 0, 156, 105, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153,
				101, 0, 153, 101, 0, 154, 101, 1, 152, 101, 0, 155, 102, 255, 253, 254, 252, 255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 255, 253, 255, 254, 255,
				238, 185, 89, 226, 172, 46, 230, 170, 48, 227, 171, 48, 228, 167, 50, 228, 172, 49, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229,
				171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 0, 155, 104, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0,
				153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 154, 101, 1, 152, 101, 0, 155, 102, 255, 253, 254, 252,
				255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 252, 255, 253, 255, 254, 255, 238, 185, 89, 226, 172, 46, 230, 170, 48, 227, 171, 48, 228, 167, 50, 228, 172,
				49, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 0, 155, 104, 0,
				152, 100, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 154,
				101, 1, 152, 101, 0, 155, 102, 255, 253, 254, 252, 255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 255, 253, 255, 254, 255, 238, 185, 89, 226, 172,
				46, 230, 170, 48, 227, 171, 48, 228, 167, 50, 228, 172, 49, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229,
				171, 48, 229, 171, 48, 229, 171, 48, 0, 155, 104, 0, 152, 100, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0,
				153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 154, 101, 1, 152, 101, 0, 155, 102, 255, 253, 254, 252, 255, 255, 255, 254, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				252, 255, 253, 255, 254, 255, 238, 185, 89, 226, 172, 46, 230, 170, 48, 227, 171, 48, 228, 167, 50, 228, 172, 49, 229, 171, 48, 229,
				171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 0, 153, 102, 0, 154, 102, 0, 153, 101, 0,
				153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 154, 101, 1, 152, 101, 0, 155,
				102, 255, 253, 254, 252, 255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 255, 253, 255, 254, 255, 238, 185, 89, 226, 172, 46, 230, 170, 48, 227, 171,
				48, 228, 167, 50, 228, 172, 49, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229,
				171, 48, 0, 153, 102, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153,
				101, 0, 153, 101, 0, 154, 101, 1, 152, 101, 0, 155, 102, 255, 253, 254, 252, 255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 255, 253, 255, 254, 255,
				238, 185, 89, 226, 172, 46, 230, 170, 48, 227, 171, 48, 228, 167, 50, 228, 172, 49, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229,
				171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 0, 153, 102, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0,
				153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 154, 101, 1, 152, 101, 0, 155, 102, 255, 253, 254, 252,
				255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 252, 255, 253, 255, 254, 255, 238, 185, 89, 226, 172, 46, 230, 170, 48, 227, 171, 48, 228, 167, 50, 228, 172,
				49, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 0, 153, 102, 0,
				153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 154,
				101, 1, 152, 101, 0, 155, 102, 255, 253, 254, 252, 255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 255, 253, 255, 254, 255, 238, 185, 89, 226, 172,
				46, 230, 170, 48, 227, 171, 48, 228, 167, 50, 228, 172, 49, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229,
				171, 48, 229, 171, 48, 229, 171, 48, 0, 153, 102, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0,
				153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 154, 101, 1, 152, 101, 0, 155, 102, 255, 253, 254, 252, 255, 255, 255, 254, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				252, 255, 253, 255, 254, 255, 238, 185, 89, 226, 172, 46, 230, 170, 48, 227, 171, 48, 228, 167, 50, 228, 172, 49, 229, 171, 48, 229,
				171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 0, 154, 103, 0, 153, 101, 0, 153, 101, 0,
				153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 154, 101, 1, 152, 101, 0, 155,
				102, 255, 253, 254, 252, 255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 255, 253, 255, 254, 255, 238, 185, 89, 226, 172, 46, 230, 170, 48, 227, 171,
				48, 228, 167, 50, 228, 172, 49, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229,
				171, 48, 0, 154, 103, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153,
				101, 0, 153, 101, 0, 154, 101, 1, 152, 101, 0, 155, 102, 255, 253, 254, 252, 255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 255, 253, 255, 254, 255,
				238, 185, 89, 226, 172, 46, 230, 170, 48, 227, 171, 48, 228, 167, 50, 228, 172, 49, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229,
				171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 0, 154, 103, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0,
				153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 153, 101, 0, 154, 101, 1, 152, 101, 0, 155, 102, 255, 253, 254, 252,
				255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 252, 255, 253, 255, 254, 255, 238, 185, 89, 226, 172, 46, 230, 170, 48, 227, 171, 48, 228, 167, 50, 228, 172,
				49, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48, 229, 171, 48,
			]
		),
	},
	{
		c: "jp",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 252, 253, 251, 255, 255, 246, 255, 255, 253, 252, 255, 255, 253, 255, 255, 255, 255, 253, 253, 255, 255, 251, 255,
				252, 253, 255, 253, 254, 255, 255, 254, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 252, 255, 255, 250, 255, 254, 255, 253,
				255, 251, 253, 255, 250, 253, 255, 254, 253, 254, 254, 254, 254, 250, 251, 253, 251, 254, 249, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 249, 250, 251, 255, 255,
				246, 255, 255, 255, 254, 255, 255, 252, 254, 255, 255, 255, 255, 255, 255, 255, 246, 254, 254, 255, 255, 254, 255, 255, 255, 254, 255,
				255, 251, 255, 255, 251, 253, 255, 253, 255, 255, 252, 255, 255, 250, 255, 253, 255, 252, 255, 249, 251, 255, 249, 252, 255, 254, 253,
				255, 255, 255, 255, 254, 255, 255, 254, 255, 247, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 251, 255, 254, 255, 255, 254, 255, 255, 253, 255, 255, 253, 255,
				244, 248, 247, 236, 251, 248, 242, 255, 255, 249, 255, 251, 246, 253, 245, 244, 250, 240, 250, 255, 246, 251, 255, 248, 248, 255, 250,
				247, 255, 250, 243, 255, 250, 255, 254, 255, 254, 255, 255, 249, 255, 255, 247, 255, 255, 248, 255, 255, 255, 255, 255, 255, 253, 253,
				255, 251, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 252, 251, 248, 246, 247, 255, 254, 255, 255, 251, 255, 254, 249, 253, 252, 255, 255, 245, 255, 255, 241, 255, 255,
				246, 255, 248, 251, 255, 250, 252, 255, 248, 252, 255, 248, 250, 255, 247, 244, 255, 246, 245, 255, 248, 244, 255, 251, 255, 254, 255,
				254, 255, 255, 249, 255, 255, 247, 255, 255, 246, 255, 254, 253, 253, 253, 255, 253, 253, 255, 253, 253, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 253, 248, 255, 252, 253,
				255, 253, 255, 254, 255, 255, 254, 255, 255, 255, 253, 250, 255, 248, 245, 255, 253, 250, 255, 248, 255, 255, 248, 255, 255, 248, 255,
				255, 241, 250, 255, 242, 252, 255, 251, 255, 254, 254, 255, 249, 254, 255, 249, 254, 255, 241, 255, 255, 243, 255, 255, 252, 255, 255,
				255, 252, 255, 255, 252, 254, 253, 253, 251, 251, 255, 249, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 253, 248, 255, 254, 255, 253, 248, 254, 254, 255, 255, 254, 255, 255,
				250, 246, 243, 255, 253, 250, 255, 247, 244, 245, 228, 238, 236, 216, 227, 232, 211, 220, 239, 218, 227, 243, 226, 236, 241, 231, 240,
				243, 243, 251, 251, 255, 255, 251, 255, 255, 245, 255, 255, 242, 255, 255, 251, 254, 255, 255, 252, 255, 255, 253, 255, 253, 253, 251,
				252, 255, 250, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 241, 255, 253, 251, 251, 253, 255, 248, 255, 255, 254, 253, 247, 247, 235, 255, 248, 237, 255, 229, 227, 243, 138, 145,
				215, 94, 85, 195, 72, 64, 188, 61, 54, 193, 66, 59, 195, 72, 65, 206, 91, 84, 252, 148, 139, 255, 209, 200, 255, 237, 236, 255, 251,
				248, 255, 255, 251, 250, 248, 251, 255, 251, 255, 255, 253, 255, 250, 255, 251, 249, 255, 251, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 237, 255, 249, 255, 255, 255, 255, 250,
				255, 255, 252, 251, 255, 255, 244, 224, 197, 186, 155, 84, 82, 169, 64, 71, 183, 62, 53, 182, 59, 51, 186, 59, 52, 188, 61, 54, 184,
				61, 54, 175, 60, 53, 171, 67, 58, 174, 77, 68, 236, 202, 201, 255, 245, 242, 255, 255, 251, 252, 250, 253, 255, 251, 255, 255, 253,
				255, 248, 253, 249, 249, 255, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 253, 253, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 248, 255, 247, 255, 255, 238, 255, 253, 255, 253, 244, 255, 191, 189, 211, 83, 84, 189, 54,
				50, 186, 65, 54, 191, 59, 47, 194, 57, 47, 198, 55, 47, 199, 55, 47, 199, 54, 49, 195, 56, 51, 190, 58, 53, 187, 60, 54, 201, 87, 87,
				255, 186, 180, 255, 248, 237, 252, 255, 248, 244, 255, 254, 249, 255, 255, 255, 253, 255, 255, 251, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 249, 255, 241, 253, 251,
				238, 255, 253, 252, 243, 234, 155, 77, 75, 187, 59, 60, 192, 57, 53, 182, 61, 50, 191, 59, 47, 194, 57, 47, 198, 55, 47, 199, 55, 47,
				199, 54, 49, 195, 56, 51, 190, 58, 53, 187, 60, 54, 179, 65, 65, 156, 79, 73, 255, 227, 216, 248, 254, 244, 244, 255, 254, 251, 255,
				255, 255, 253, 255, 255, 250, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 253, 255, 252, 255, 255, 255, 249, 248, 220, 142, 142, 185, 60, 58, 197, 59, 49, 193, 56, 40,
				198, 58, 43, 188, 60, 47, 190, 60, 46, 192, 58, 46, 195, 57, 46, 197, 56, 47, 195, 57, 47, 194, 57, 49, 192, 57, 51, 204, 57, 49, 177,
				50, 44, 234, 157, 151, 255, 250, 241, 247, 255, 253, 250, 255, 255, 255, 250, 254, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 249, 255, 252, 255, 255, 255,
				237, 236, 184, 106, 106, 190, 65, 63, 198, 60, 50, 192, 55, 39, 200, 60, 45, 188, 60, 47, 190, 60, 46, 192, 58, 46, 195, 57, 46, 197,
				56, 47, 195, 57, 47, 194, 57, 49, 192, 57, 51, 199, 52, 44, 201, 74, 68, 174, 97, 91, 249, 235, 226, 247, 255, 253, 249, 255, 255,
				255, 250, 254, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 253, 255, 250, 255, 251, 249, 214, 210, 194, 81, 83, 199, 45, 45, 192, 54, 41, 186, 61, 43, 196,
				58, 48, 194, 57, 49, 194, 57, 49, 194, 57, 47, 194, 57, 47, 194, 57, 47, 195, 57, 47, 197, 56, 49, 197, 55, 51, 190, 60, 38, 197, 49,
				45, 187, 70, 76, 252, 208, 209, 255, 255, 253, 255, 253, 255, 255, 253, 255, 243, 255, 253, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 253, 255, 252, 255, 253, 242, 207,
				203, 172, 59, 61, 212, 58, 58, 194, 56, 43, 191, 66, 48, 192, 54, 44, 194, 57, 49, 194, 57, 49, 194, 57, 47, 194, 57, 47, 194, 57, 47,
				195, 57, 47, 197, 56, 49, 197, 55, 51, 196, 66, 44, 195, 47, 43, 185, 68, 74, 251, 207, 208, 255, 255, 253, 255, 253, 255, 255, 253,
				255, 242, 255, 252, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 249, 255, 245, 255, 247, 242, 214, 202, 190, 76, 75, 197, 44, 39, 188, 58, 44, 188, 66, 53, 199, 50, 54, 198,
				54, 53, 197, 55, 51, 194, 57, 49, 191, 58, 49, 191, 59, 47, 192, 58, 49, 194, 57, 49, 195, 56, 51, 183, 58, 36, 209, 53, 54, 181, 54,
				65, 247, 207, 207, 248, 255, 253, 255, 253, 255, 255, 247, 252, 251, 255, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 251, 255, 246, 255, 248, 248, 220, 208, 192, 78,
				77, 206, 53, 48, 189, 59, 45, 182, 60, 47, 204, 55, 59, 198, 54, 53, 197, 55, 51, 194, 57, 49, 191, 58, 49, 191, 59, 47, 192, 58, 49,
				194, 57, 49, 195, 56, 51, 187, 62, 40, 207, 51, 52, 199, 72, 83, 250, 210, 210, 247, 255, 252, 255, 253, 255, 255, 245, 250, 251, 255,
				251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 253, 253,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 250, 255, 255, 251, 251, 253, 232, 229, 178, 110, 111, 187, 62, 68, 207, 53, 55, 197, 54, 40, 184, 63, 36, 191, 57, 46, 195,
				61, 50, 195, 63, 51, 190, 59, 49, 189, 56, 47, 191, 58, 49, 196, 59, 51, 195, 58, 50, 211, 52, 46, 180, 61, 53, 174, 111, 106, 250,
				230, 229, 255, 254, 255, 254, 255, 255, 250, 254, 255, 251, 255, 253, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 253, 253, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 250, 255, 253, 247, 247, 255, 249, 246, 218, 150, 151, 186,
				61, 67, 198, 44, 46, 205, 62, 48, 190, 69, 42, 191, 57, 46, 188, 54, 43, 186, 54, 42, 190, 59, 49, 194, 61, 52, 191, 58, 49, 190, 53,
				45, 189, 52, 44, 213, 54, 48, 174, 55, 47, 210, 147, 142, 255, 244, 243, 255, 254, 255, 246, 247, 252, 252, 255, 255, 250, 255, 252,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				254, 253, 255, 245, 255, 255, 244, 255, 250, 255, 242, 234, 148, 72, 72, 184, 61, 64, 195, 52, 54, 191, 52, 47, 197, 56, 49, 199, 56,
				50, 204, 56, 54, 205, 55, 54, 200, 52, 50, 193, 51, 49, 192, 59, 54, 198, 69, 63, 167, 62, 59, 167, 92, 89, 255, 226, 222, 255, 252,
				253, 251, 252, 255, 255, 254, 255, 255, 254, 255, 255, 254, 250, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 251, 255, 245, 255, 255, 234, 252, 240, 255, 251, 243, 255, 199,
				199, 199, 76, 79, 200, 57, 59, 198, 59, 54, 198, 57, 50, 198, 55, 49, 200, 52, 50, 202, 52, 51, 203, 55, 53, 199, 57, 55, 188, 55, 50,
				180, 51, 45, 193, 88, 85, 255, 181, 178, 255, 245, 241, 255, 252, 253, 252, 253, 255, 252, 251, 255, 255, 254, 255, 251, 250, 246,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				247, 255, 255, 250, 249, 254, 255, 252, 255, 252, 248, 245, 255, 253, 242, 224, 197, 188, 158, 86, 87, 173, 61, 73, 179, 65, 54, 180,
				59, 51, 185, 56, 51, 191, 57, 54, 189, 59, 57, 181, 63, 59, 175, 74, 64, 175, 85, 74, 231, 192, 195, 255, 249, 248, 250, 249, 247,
				249, 255, 255, 254, 255, 255, 254, 249, 253, 255, 253, 253, 255, 254, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 245, 255, 255, 250, 249, 254, 255, 252, 255, 255, 254, 251,
				255, 251, 240, 255, 248, 239, 255, 215, 216, 245, 133, 145, 207, 93, 82, 197, 76, 68, 190, 61, 56, 193, 59, 56, 194, 64, 62, 207, 89,
				85, 249, 148, 138, 255, 203, 192, 255, 243, 246, 255, 246, 245, 255, 255, 253, 247, 253, 253, 254, 255, 255, 255, 253, 255, 251, 245,
				245, 255, 254, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 254, 254, 255, 255, 255, 255, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255,
				253, 255, 255, 253, 255, 252, 255, 255, 249, 255, 255, 251, 255, 255, 254, 255, 251, 255, 255, 251, 255, 250, 255, 254, 250, 255, 246,
				243, 241, 230, 228, 233, 217, 217, 231, 211, 212, 238, 216, 218, 241, 222, 224, 239, 229, 230, 246, 246, 246, 251, 255, 255, 252, 253,
				255, 247, 255, 255, 248, 255, 255, 249, 255, 255, 254, 254, 254, 255, 249, 251, 255, 253, 255, 255, 251, 250, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 254, 255, 255, 255, 255, 255, 255,
				253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 251, 254, 255, 251,
				255, 255, 252, 255, 254, 252, 253, 251, 255, 255, 252, 255, 251, 255, 251, 247, 255, 251, 248, 255, 252, 250, 255, 250, 250, 255, 249,
				250, 255, 243, 245, 255, 245, 247, 255, 252, 253, 255, 255, 255, 248, 254, 254, 254, 255, 255, 247, 255, 255, 245, 255, 254, 249, 255,
				255, 251, 251, 251, 255, 253, 255, 255, 251, 253, 255, 254, 253, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 252, 255, 251, 252, 255, 253, 254, 255, 255, 255, 254, 255, 255, 254,
				255, 255, 254, 255, 252, 255, 255, 248, 255, 255, 254, 255, 251, 254, 255, 251, 252, 255, 251, 251, 255, 251, 251, 255, 251, 251, 255,
				253, 252, 255, 255, 254, 255, 255, 249, 255, 255, 249, 255, 255, 252, 255, 255, 255, 255, 253, 255, 254, 253, 255, 254, 255, 255, 255,
				255, 252, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 252, 255, 251, 252, 255, 253, 254, 255, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 252, 255, 255, 248, 255,
				255, 254, 255, 251, 254, 255, 251, 252, 255, 251, 251, 255, 251, 251, 255, 251, 251, 255, 253, 252, 255, 255, 254, 255, 255, 249, 255,
				255, 249, 255, 255, 252, 255, 255, 255, 255, 253, 255, 254, 253, 255, 254, 255, 255, 255, 255, 252, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 250, 250, 252, 254, 254, 254, 254, 255,
				255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 251, 255, 251, 254, 255,
				253, 255, 255, 255, 254, 255, 255, 252, 255, 255, 252, 255, 255, 255, 254, 255, 255, 252, 255, 255, 252, 255, 255, 253, 255, 251, 255,
				255, 251, 255, 255, 252, 255, 255, 255, 253, 255, 255, 250, 255, 255, 247, 255, 254, 255, 255, 255, 254, 255, 255, 253, 253, 255, 253,
				253, 255, 254, 253, 255, 255, 255, 252, 255, 255, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255,
				255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 251, 255, 251, 254, 255, 253, 255, 255, 255, 254, 255, 255, 252, 255,
				255, 252, 255, 255, 255, 254, 255, 255, 252, 255, 255, 252, 255, 255, 253, 255, 252, 255, 255, 251, 255, 255, 252, 255, 255, 255, 253,
				255, 255, 250, 255, 255, 247, 255, 254, 255, 255, 255, 254, 255, 255, 253, 253, 255, 253, 253, 255, 254, 253, 255, 255, 255, 252, 255,
				255, 251, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255,
			]
		),
	},
	{
		c: "lu",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				204, 164, 45, 200, 141, 37, 221, 135, 54, 228, 132, 59, 231, 131, 61, 231, 131, 61, 231, 131, 61, 231, 131, 61, 231, 131, 61, 231,
				131, 61, 231, 131, 61, 231, 131, 61, 231, 131, 61, 231, 131, 61, 231, 131, 61, 231, 131, 61, 231, 131, 61, 231, 131, 61, 231, 131, 61,
				231, 131, 61, 231, 131, 61, 231, 131, 61, 230, 131, 60, 227, 132, 60, 225, 133, 60, 224, 133, 59, 224, 133, 59, 224, 133, 59, 224,
				133, 59, 224, 133, 59, 224, 133, 59, 224, 133, 59, 223, 133, 59, 220, 134, 57, 215, 135, 65, 211, 136, 63, 209, 137, 63, 209, 137, 63,
				209, 137, 59, 209, 138, 53, 210, 139, 50, 211, 140, 48, 172, 124, 26, 163, 93, 18, 194, 85, 31, 205, 81, 41, 209, 79, 44, 208, 77, 42,
				208, 77, 42, 208, 76, 41, 208, 76, 41, 208, 76, 41, 208, 76, 41, 208, 76, 41, 208, 76, 41, 208, 76, 41, 208, 76, 41, 208, 76, 41, 208,
				76, 41, 208, 76, 41, 208, 76, 41, 208, 76, 41, 208, 76, 41, 208, 76, 41, 206, 76, 43, 201, 76, 44, 199, 77, 44, 198, 77, 44, 198, 77,
				44, 198, 77, 44, 198, 77, 44, 198, 77, 44, 198, 77, 44, 198, 77, 44, 197, 77, 44, 194, 78, 44, 189, 79, 55, 186, 80, 56, 186, 81, 57,
				187, 83, 59, 188, 85, 50, 190, 86, 41, 190, 87, 35, 189, 89, 29, 166, 121, 35, 169, 107, 61, 180, 89, 47, 189, 83, 66, 191, 80, 71,
				189, 79, 69, 192, 76, 68, 193, 74, 67, 194, 73, 66, 196, 71, 65, 196, 71, 65, 196, 71, 65, 196, 71, 65, 196, 71, 65, 196, 71, 65, 196,
				71, 65, 196, 71, 65, 196, 71, 65, 196, 71, 65, 196, 71, 65, 196, 71, 65, 195, 71, 65, 193, 70, 64, 189, 72, 63, 187, 73, 63, 185, 73,
				62, 185, 73, 62, 186, 74, 63, 186, 74, 63, 186, 74, 63, 186, 74, 63, 186, 74, 63, 186, 74, 63, 185, 74, 63, 179, 75, 71, 177, 76, 71,
				178, 78, 73, 182, 82, 77, 184, 86, 69, 204, 82, 68, 205, 82, 67, 188, 87, 69, 134, 79, 52, 147, 75, 90, 183, 86, 50, 191, 81, 65, 194,
				79, 70, 192, 77, 68, 195, 75, 68, 196, 73, 66, 198, 72, 66, 199, 70, 65, 199, 70, 65, 199, 70, 65, 198, 70, 65, 195, 71, 65, 195, 71,
				65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 192, 70, 69, 190, 71, 66, 188, 71, 65,
				187, 72, 65, 187, 72, 65, 187, 72, 65, 188, 73, 67, 188, 73, 67, 188, 73, 67, 188, 73, 67, 188, 73, 67, 186, 74, 65, 182, 72, 77, 179,
				74, 71, 181, 77, 72, 184, 80, 75, 187, 83, 68, 208, 80, 67, 208, 80, 66, 190, 85, 68, 167, 118, 34, 176, 110, 59, 184, 85, 52, 192,
				80, 65, 194, 78, 69, 193, 77, 68, 195, 74, 67, 197, 73, 66, 199, 72, 66, 201, 70, 66, 201, 70, 65, 201, 70, 65, 199, 70, 65, 196, 71,
				65, 196, 71, 65, 196, 71, 65, 196, 71, 65, 196, 71, 65, 196, 71, 65, 196, 71, 65, 196, 71, 65, 195, 71, 65, 194, 70, 66, 191, 70, 64,
				190, 70, 63, 189, 69, 63, 189, 69, 63, 190, 70, 64, 192, 72, 66, 192, 73, 66, 192, 73, 67, 193, 74, 67, 192, 74, 67, 188, 74, 66, 182,
				72, 69, 179, 74, 68, 180, 76, 70, 184, 80, 73, 186, 84, 66, 206, 79, 64, 207, 79, 63, 189, 84, 65, 153, 106, 0, 162, 100, 11, 185, 83,
				52, 193, 78, 65, 195, 77, 69, 193, 75, 67, 196, 74, 67, 198, 72, 66, 199, 71, 66, 202, 70, 66, 201, 69, 65, 201, 69, 65, 200, 69, 65,
				195, 71, 65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 194, 70, 63, 192,
				69, 62, 191, 69, 62, 190, 68, 61, 190, 68, 61, 192, 69, 62, 194, 72, 65, 196, 74, 67, 196, 74, 67, 197, 75, 68, 196, 75, 68, 190, 74,
				66, 183, 73, 65, 180, 74, 65, 180, 76, 67, 184, 79, 70, 185, 82, 62, 205, 79, 61, 205, 78, 60, 188, 83, 62, 151, 98, 13, 168, 99, 39,
				188, 81, 55, 195, 77, 65, 197, 75, 68, 196, 74, 67, 199, 73, 67, 201, 70, 66, 203, 70, 66, 206, 69, 66, 204, 68, 65, 204, 68, 65, 202,
				69, 65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 195, 71, 65, 194, 70,
				63, 193, 69, 62, 192, 67, 61, 191, 66, 60, 191, 66, 60, 193, 69, 62, 197, 72, 66, 198, 73, 67, 200, 76, 69, 201, 77, 70, 199, 76, 69,
				192, 75, 67, 187, 72, 66, 182, 72, 64, 182, 73, 66, 185, 76, 69, 186, 79, 60, 205, 74, 57, 206, 74, 57, 188, 79, 58, 173, 124, 64,
				152, 82, 76, 183, 77, 68, 190, 74, 68, 193, 73, 68, 193, 73, 68, 198, 71, 68, 201, 70, 68, 203, 70, 68, 204, 68, 67, 204, 68, 67, 204,
				68, 67, 202, 69, 67, 195, 71, 67, 195, 71, 67, 195, 71, 67, 195, 71, 67, 195, 71, 67, 195, 71, 67, 195, 71, 67, 195, 71, 67, 195, 71,
				67, 194, 69, 67, 194, 69, 68, 193, 68, 68, 192, 67, 67, 192, 67, 67, 192, 67, 67, 193, 68, 68, 195, 70, 71, 197, 71, 72, 198, 73, 73,
				197, 73, 73, 194, 74, 73, 183, 69, 69, 180, 70, 69, 179, 70, 69, 181, 72, 70, 182, 74, 61, 198, 70, 60, 197, 70, 59, 179, 76, 61, 157,
				118, 55, 143, 83, 75, 165, 73, 68, 177, 70, 68, 182, 69, 69, 184, 71, 70, 192, 69, 72, 196, 68, 72, 198, 68, 73, 202, 67, 74, 202, 67,
				74, 202, 67, 74, 200, 67, 74, 193, 70, 75, 193, 70, 74, 194, 70, 74, 194, 70, 74, 194, 71, 75, 194, 71, 76, 194, 71, 76, 194, 71, 76,
				194, 71, 76, 189, 71, 76, 184, 73, 77, 179, 72, 76, 175, 73, 76, 175, 73, 76, 175, 73, 76, 175, 73, 76, 176, 75, 78, 176, 75, 78, 176,
				75, 78, 176, 75, 78, 174, 76, 77, 167, 76, 74, 164, 76, 73, 163, 77, 73, 163, 76, 73, 161, 78, 67, 171, 75, 65, 170, 75, 65, 157, 79,
				66, 198, 168, 103, 195, 144, 134, 182, 104, 100, 183, 87, 88, 188, 86, 88, 189, 87, 89, 202, 87, 94, 206, 88, 96, 210, 89, 98, 215,
				89, 101, 216, 89, 101, 214, 88, 100, 211, 88, 100, 204, 89, 101, 202, 88, 97, 200, 85, 94, 199, 84, 93, 198, 83, 92, 198, 83, 92, 198,
				83, 92, 198, 83, 92, 198, 83, 92, 194, 88, 96, 201, 107, 114, 204, 115, 121, 198, 118, 122, 198, 118, 122, 198, 118, 122, 198, 118,
				122, 198, 118, 122, 198, 118, 122, 198, 118, 122, 198, 119, 122, 196, 119, 120, 191, 120, 117, 188, 121, 115, 187, 121, 115, 187, 121,
				115, 183, 122, 113, 190, 120, 112, 190, 121, 112, 185, 127, 117, 222, 221, 152, 231, 216, 202, 244, 211, 202, 252, 225, 216, 243, 211,
				203, 239, 201, 192, 237, 203, 196, 241, 206, 202, 245, 209, 207, 247, 213, 212, 247, 213, 212, 246, 211, 210, 243, 209, 209, 234, 210,
				207, 234, 209, 206, 234, 210, 207, 236, 211, 208, 237, 214, 211, 237, 214, 211, 237, 214, 211, 237, 214, 211, 237, 214, 211, 234, 214,
				209, 240, 220, 221, 240, 221, 224, 237, 221, 223, 237, 221, 223, 237, 221, 223, 237, 221, 223, 237, 221, 223, 237, 221, 223, 237, 221,
				223, 237, 221, 222, 235, 222, 221, 225, 212, 204, 223, 213, 202, 223, 213, 202, 223, 213, 202, 227, 212, 202, 233, 210, 202, 236, 208,
				202, 238, 206, 203, 216, 225, 163, 223, 221, 215, 231, 225, 215, 243, 234, 225, 248, 238, 229, 235, 224, 216, 229, 225, 220, 231, 228,
				224, 232, 231, 228, 231, 236, 235, 232, 236, 235, 232, 236, 235, 229, 236, 235, 219, 235, 232, 223, 239, 235, 226, 242, 238, 230, 246,
				242, 233, 249, 246, 234, 250, 247, 234, 250, 247, 234, 250, 247, 234, 250, 247, 228, 249, 245, 230, 247, 243, 228, 245, 241, 222, 245,
				240, 222, 245, 240, 222, 245, 240, 222, 245, 240, 222, 245, 240, 222, 245, 240, 222, 245, 240, 222, 246, 240, 220, 246, 238, 220, 248,
				233, 219, 249, 232, 218, 249, 231, 218, 249, 231, 227, 246, 233, 248, 240, 233, 255, 236, 232, 253, 226, 225, 222, 233, 177, 225, 228,
				231, 226, 229, 221, 231, 232, 224, 228, 229, 221, 228, 229, 221, 228, 232, 229, 230, 235, 233, 234, 237, 237, 239, 240, 243, 240, 240,
				244, 238, 241, 244, 236, 241, 244, 230, 239, 241, 228, 240, 241, 231, 243, 244, 231, 243, 244, 231, 243, 244, 231, 243, 244, 231, 243,
				244, 231, 243, 244, 231, 243, 244, 225, 242, 242, 230, 239, 241, 229, 237, 239, 224, 237, 238, 224, 237, 238, 224, 237, 238, 224, 237,
				238, 224, 237, 238, 224, 237, 238, 224, 237, 238, 223, 238, 237, 222, 238, 236, 217, 241, 228, 215, 242, 227, 215, 242, 226, 215, 242,
				226, 224, 239, 228, 240, 234, 228, 247, 231, 228, 251, 225, 226, 224, 236, 185, 223, 230, 238, 220, 230, 224, 221, 231, 224, 221, 231,
				224, 221, 231, 224, 223, 235, 233, 228, 238, 237, 233, 239, 241, 244, 240, 248, 245, 241, 248, 241, 241, 248, 238, 240, 246, 234, 238,
				243, 229, 237, 241, 229, 238, 242, 229, 238, 242, 229, 238, 242, 229, 238, 242, 229, 238, 242, 229, 238, 242, 229, 238, 242, 226, 239,
				242, 233, 235, 241, 233, 233, 240, 229, 235, 240, 229, 235, 240, 229, 235, 240, 229, 235, 240, 229, 235, 240, 229, 235, 240, 229, 235,
				240, 229, 234, 239, 226, 234, 237, 220, 241, 229, 217, 240, 227, 217, 240, 226, 217, 240, 226, 225, 237, 228, 238, 233, 228, 244, 230,
				227, 247, 223, 223, 211, 221, 167, 209, 217, 222, 215, 224, 226, 218, 228, 230, 218, 229, 231, 218, 229, 231, 223, 232, 236, 226, 234,
				241, 233, 235, 244, 249, 234, 249, 250, 235, 250, 249, 235, 249, 244, 234, 247, 235, 234, 245, 231, 232, 243, 232, 233, 244, 232, 234,
				244, 232, 234, 244, 232, 234, 244, 232, 234, 244, 232, 234, 244, 232, 234, 244, 228, 233, 243, 235, 232, 243, 235, 231, 243, 234, 230,
				242, 234, 230, 242, 234, 230, 242, 234, 230, 242, 234, 230, 242, 234, 230, 242, 234, 230, 242, 233, 231, 242, 232, 231, 240, 229, 234,
				231, 227, 236, 228, 226, 236, 227, 226, 236, 227, 229, 234, 231, 234, 232, 231, 238, 230, 229, 241, 223, 223, 221, 220, 166, 224, 219,
				218, 211, 222, 230, 214, 227, 235, 216, 229, 237, 216, 229, 237, 219, 229, 240, 221, 232, 242, 228, 232, 245, 246, 229, 248, 247, 229,
				248, 247, 229, 246, 243, 228, 244, 238, 230, 243, 237, 229, 240, 237, 229, 240, 237, 229, 240, 237, 229, 240, 237, 229, 240, 237, 229,
				240, 237, 229, 240, 237, 229, 240, 239, 229, 238, 238, 227, 238, 237, 227, 238, 236, 228, 238, 236, 228, 238, 236, 228, 238, 236, 228,
				238, 236, 228, 238, 236, 228, 238, 236, 228, 238, 236, 229, 239, 234, 232, 237, 230, 232, 232, 228, 234, 230, 227, 235, 229, 227, 235,
				229, 231, 233, 233, 234, 232, 233, 236, 230, 231, 238, 222, 224, 218, 219, 165, 219, 218, 218, 211, 222, 236, 213, 226, 240, 213, 227,
				241, 213, 227, 241, 216, 227, 243, 218, 228, 244, 223, 227, 244, 237, 224, 246, 237, 224, 247, 237, 225, 245, 237, 225, 243, 235, 227,
				242, 235, 226, 239, 235, 226, 239, 235, 226, 239, 235, 226, 239, 235, 226, 239, 235, 226, 239, 235, 226, 239, 235, 226, 239, 236, 226,
				238, 236, 226, 239, 236, 226, 239, 235, 226, 239, 235, 226, 239, 235, 226, 239, 235, 226, 239, 235, 226, 239, 235, 226, 239, 235, 226,
				239, 234, 227, 238, 231, 229, 236, 228, 231, 232, 225, 233, 229, 225, 234, 229, 225, 234, 229, 227, 233, 234, 229, 232, 234, 232, 230,
				232, 235, 223, 224, 220, 223, 170, 218, 221, 221, 210, 222, 242, 211, 225, 244, 211, 225, 244, 211, 225, 244, 213, 225, 244, 215, 226,
				246, 219, 224, 246, 228, 221, 244, 228, 221, 244, 229, 222, 244, 229, 222, 243, 229, 223, 240, 229, 223, 238, 229, 223, 238, 229, 223,
				238, 229, 223, 238, 229, 223, 238, 229, 223, 238, 229, 223, 238, 229, 223, 238, 229, 223, 238, 229, 223, 238, 229, 223, 238, 229, 223,
				238, 229, 223, 238, 229, 223, 238, 229, 223, 238, 229, 223, 238, 229, 223, 238, 229, 223, 238, 229, 224, 238, 228, 226, 236, 224, 229,
				233, 222, 232, 229, 221, 232, 228, 221, 232, 228, 221, 231, 234, 225, 230, 233, 227, 229, 231, 232, 223, 223, 221, 225, 185, 216, 223,
				241, 205, 224, 254, 198, 223, 251, 193, 219, 246, 193, 219, 246, 194, 219, 245, 195, 218, 245, 196, 218, 245, 198, 218, 245, 198, 218,
				246, 200, 220, 247, 200, 221, 246, 201, 221, 245, 201, 221, 243, 201, 221, 243, 201, 221, 243, 201, 221, 243, 201, 221, 243, 201, 221,
				243, 201, 221, 243, 201, 221, 243, 201, 221, 243, 201, 221, 243, 201, 221, 243, 201, 221, 243, 201, 221, 243, 201, 221, 243, 201, 221,
				243, 201, 221, 243, 201, 221, 243, 201, 221, 243, 201, 221, 242, 200, 221, 240, 198, 222, 233, 196, 222, 230, 195, 222, 228, 195, 222,
				228, 199, 220, 228, 204, 219, 227, 209, 218, 224, 220, 216, 217, 179, 188, 154, 158, 172, 195, 180, 210, 250, 148, 187, 232, 130, 171,
				216, 130, 171, 216, 126, 172, 214, 123, 173, 214, 121, 173, 214, 119, 174, 214, 119, 174, 214, 122, 177, 215, 123, 178, 215, 124, 179,
				216, 124, 179, 216, 124, 179, 216, 124, 179, 216, 124, 179, 216, 124, 179, 216, 124, 179, 216, 124, 179, 216, 124, 179, 216, 124, 179,
				214, 124, 179, 216, 124, 179, 216, 124, 179, 216, 124, 179, 216, 124, 179, 216, 124, 179, 216, 124, 179, 216, 124, 179, 216, 124, 179,
				216, 124, 179, 216, 125, 179, 214, 128, 180, 209, 130, 180, 206, 130, 180, 205, 130, 180, 205, 139, 178, 199, 149, 176, 193, 160, 176,
				189, 184, 179, 185, 155, 164, 136, 137, 154, 203, 108, 148, 199, 89, 138, 188, 84, 137, 185, 84, 137, 185, 81, 138, 182, 79, 139, 181,
				78, 139, 181, 77, 140, 180, 77, 140, 180, 79, 142, 182, 80, 143, 184, 80, 144, 185, 80, 144, 185, 80, 144, 185, 80, 144, 185, 80, 144,
				185, 80, 144, 185, 80, 144, 185, 80, 144, 185, 80, 144, 185, 80, 143, 185, 80, 143, 185, 80, 144, 185, 80, 144, 185, 80, 144, 185, 80,
				144, 185, 80, 144, 185, 80, 144, 185, 80, 144, 185, 80, 144, 185, 81, 144, 186, 83, 145, 186, 85, 146, 183, 86, 147, 182, 87, 148,
				182, 87, 148, 182, 94, 146, 175, 103, 145, 170, 111, 144, 166, 128, 145, 160, 155, 164, 143, 139, 159, 229, 85, 133, 188, 73, 132,
				184, 70, 132, 184, 68, 131, 182, 64, 131, 178, 62, 131, 175, 62, 131, 174, 62, 131, 172, 62, 131, 173, 65, 133, 176, 66, 134, 178, 66,
				134, 180, 66, 134, 180, 66, 134, 180, 66, 134, 180, 66, 134, 180, 66, 134, 180, 66, 134, 180, 66, 134, 180, 66, 134, 180, 66, 134,
				182, 66, 134, 180, 66, 134, 180, 66, 134, 180, 66, 134, 180, 66, 134, 180, 66, 134, 180, 66, 134, 180, 66, 134, 180, 66, 134, 180, 67,
				135, 182, 68, 137, 182, 69, 138, 182, 71, 139, 181, 71, 141, 182, 71, 141, 182, 76, 140, 174, 84, 138, 169, 89, 137, 166, 97, 136,
				159, 159, 158, 143, 145, 153, 231, 80, 142, 208, 60, 141, 203, 51, 138, 199, 51, 138, 198, 57, 135, 195, 58, 134, 188, 60, 134, 185,
				61, 134, 180, 61, 134, 181, 63, 136, 184, 64, 136, 186, 64, 136, 192, 64, 136, 194, 64, 136, 194, 64, 136, 194, 64, 136, 194, 64, 136,
				194, 64, 136, 194, 64, 136, 194, 64, 136, 194, 64, 136, 194, 64, 136, 194, 64, 136, 194, 64, 136, 194, 64, 136, 194, 64, 136, 194, 64,
				136, 194, 64, 136, 194, 64, 136, 194, 64, 136, 194, 65, 137, 194, 64, 138, 193, 64, 141, 193, 64, 142, 192, 64, 143, 193, 64, 143,
				193, 60, 145, 187, 59, 146, 185, 56, 147, 186, 50, 149, 191, 134, 129, 81, 124, 133, 131, 86, 138, 211, 67, 140, 208, 60, 140, 206,
				59, 139, 205, 59, 137, 202, 59, 135, 201, 60, 135, 200, 62, 135, 199, 62, 135, 199, 63, 136, 202, 63, 136, 204, 63, 135, 208, 63, 135,
				210, 63, 135, 210, 63, 135, 210, 63, 135, 210, 63, 135, 210, 63, 135, 210, 63, 135, 210, 63, 135, 210, 63, 135, 210, 63, 135, 210, 63,
				135, 210, 63, 135, 210, 63, 135, 210, 63, 135, 210, 63, 135, 210, 63, 135, 210, 63, 135, 210, 63, 135, 210, 64, 137, 210, 63, 138,
				208, 62, 143, 202, 61, 145, 201, 61, 147, 201, 61, 147, 201, 57, 148, 195, 56, 149, 194, 55, 150, 195, 55, 153, 202, 166, 159, 117,
				151, 157, 162, 92, 138, 193, 74, 141, 191, 67, 141, 189, 65, 139, 187, 62, 137, 188, 62, 137, 190, 62, 137, 191, 62, 137, 192, 63,
				138, 193, 65, 140, 196, 66, 141, 200, 67, 141, 205, 67, 141, 207, 67, 141, 207, 67, 141, 207, 67, 141, 207, 67, 141, 207, 67, 141,
				207, 67, 141, 207, 67, 141, 207, 67, 141, 207, 67, 141, 209, 68, 141, 210, 68, 141, 210, 68, 141, 210, 68, 141, 210, 68, 141, 210, 68,
				141, 210, 68, 141, 210, 68, 141, 210, 68, 142, 211, 68, 143, 209, 63, 145, 204, 62, 147, 204, 62, 147, 204, 62, 147, 204, 58, 149,
				198, 57, 150, 197, 57, 151, 199, 59, 156, 209, 170, 163, 126, 154, 158, 173, 97, 138, 180, 80, 142, 179, 73, 142, 176, 72, 140, 175,
				66, 139, 179, 66, 141, 184, 66, 142, 186, 66, 143, 190, 67, 144, 191, 69, 146, 195, 69, 146, 197, 68, 144, 201, 68, 144, 203, 68, 144,
				203, 68, 144, 203, 68, 144, 203, 68, 144, 203, 68, 144, 203, 68, 144, 203, 68, 144, 203, 68, 144, 203, 69, 143, 207, 70, 143, 208, 70,
				143, 208, 70, 143, 208, 70, 143, 208, 70, 143, 208, 70, 143, 208, 70, 143, 208, 70, 143, 208, 70, 144, 208, 69, 145, 208, 64, 147,
				204, 63, 148, 206, 63, 148, 207, 63, 148, 207, 60, 150, 201, 58, 151, 200, 58, 152, 202, 61, 158, 213, 144, 171, 145, 111, 137, 226,
				105, 142, 190, 84, 140, 184, 77, 139, 181, 76, 138, 180, 73, 141, 186, 69, 143, 190, 69, 145, 194, 66, 147, 198, 67, 148, 199, 68,
				150, 198, 68, 150, 198, 68, 149, 198, 68, 150, 196, 68, 150, 196, 68, 150, 196, 68, 150, 196, 68, 150, 196, 68, 150, 196, 68, 150,
				196, 68, 150, 196, 70, 149, 198, 70, 147, 198, 70, 147, 199, 70, 147, 199, 70, 147, 199, 70, 147, 199, 70, 147, 199, 70, 147, 199, 70,
				147, 199, 70, 147, 199, 71, 148, 201, 70, 148, 204, 66, 149, 208, 64, 149, 211, 64, 149, 212, 64, 149, 212, 61, 151, 206, 59, 151,
				204, 59, 153, 207, 62, 159, 217, 170, 175, 125, 123, 138, 193, 114, 138, 215, 87, 136, 207, 79, 135, 205, 78, 134, 206, 72, 137, 213,
				72, 141, 223, 75, 148, 233, 71, 151, 239, 72, 152, 240, 71, 151, 238, 70, 151, 237, 68, 149, 235, 68, 149, 233, 68, 149, 233, 68, 149,
				233, 68, 149, 233, 68, 149, 233, 68, 149, 233, 68, 149, 233, 68, 149, 233, 70, 149, 231, 73, 149, 231, 73, 150, 230, 73, 150, 228, 73,
				150, 228, 73, 150, 228, 73, 150, 228, 73, 150, 228, 73, 150, 228, 73, 150, 228, 73, 150, 228, 71, 150, 226, 69, 151, 224, 67, 151,
				219, 66, 151, 218, 66, 151, 218, 63, 153, 212, 61, 153, 210, 61, 155, 213, 66, 162, 225,
			]
		),
	},
	{
		c: "mx",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				12, 106, 72, 0, 118, 74, 0, 119, 87, 0, 120, 87, 0, 120, 87, 0, 120, 87, 0, 119, 86, 0, 119, 86, 0, 118, 86, 0, 119, 84, 0, 124, 77,
				0, 121, 77, 0, 122, 76, 0, 118, 70, 254, 255, 251, 249, 254, 250, 255, 253, 254, 255, 250, 255, 255, 252, 252, 255, 250, 255, 254,
				255, 255, 255, 251, 255, 255, 253, 255, 255, 255, 255, 255, 245, 255, 255, 249, 255, 255, 255, 255, 255, 255, 253, 187, 3, 57, 196, 0,
				53, 209, 0, 53, 193, 0, 46, 199, 0, 53, 178, 4, 53, 191, 0, 52, 191, 0, 52, 191, 0, 52, 191, 0, 52, 191, 0, 51, 192, 1, 52, 192, 1,
				52, 192, 1, 52, 14, 108, 74, 3, 126, 82, 0, 117, 85, 0, 118, 85, 0, 118, 85, 0, 118, 85, 0, 118, 85, 0, 118, 85, 0, 117, 85, 0, 118,
				83, 0, 126, 79, 0, 120, 76, 0, 121, 75, 0, 128, 80, 251, 253, 248, 252, 255, 253, 255, 254, 255, 255, 251, 255, 255, 251, 251, 255,
				250, 255, 254, 255, 255, 255, 251, 255, 255, 253, 255, 255, 255, 255, 255, 249, 255, 255, 250, 255, 249, 249, 249, 252, 252, 250, 186,
				2, 56, 193, 0, 50, 207, 0, 51, 202, 1, 55, 192, 0, 46, 182, 8, 57, 190, 0, 51, 190, 0, 51, 191, 0, 52, 191, 0, 52, 191, 0, 51, 191, 0,
				51, 191, 0, 51, 191, 0, 51, 8, 104, 90, 0, 121, 98, 0, 120, 85, 0, 120, 85, 0, 120, 85, 0, 120, 85, 0, 120, 85, 0, 120, 85, 0, 120,
				84, 0, 120, 84, 3, 114, 95, 10, 113, 92, 0, 118, 86, 0, 125, 82, 255, 249, 250, 254, 255, 250, 246, 255, 251, 255, 255, 253, 252, 254,
				251, 255, 253, 255, 249, 255, 255, 255, 254, 255, 254, 255, 255, 247, 255, 255, 253, 252, 255, 248, 255, 255, 255, 254, 255, 243, 254,
				248, 207, 0, 58, 188, 0, 49, 191, 1, 49, 180, 5, 48, 204, 3, 57, 189, 0, 48, 194, 0, 52, 194, 0, 52, 194, 0, 52, 194, 0, 52, 194, 0,
				50, 194, 0, 50, 194, 0, 50, 194, 0, 50, 17, 113, 99, 0, 118, 95, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119,
				84, 0, 119, 83, 0, 119, 83, 1, 112, 93, 12, 115, 94, 0, 116, 84, 0, 124, 81, 255, 252, 253, 255, 255, 251, 245, 255, 250, 255, 255,
				253, 254, 255, 253, 255, 253, 255, 246, 254, 255, 252, 251, 255, 254, 255, 255, 247, 255, 255, 255, 254, 255, 249, 255, 255, 251, 249,
				250, 248, 255, 253, 202, 0, 53, 194, 3, 55, 192, 2, 50, 180, 5, 48, 197, 0, 50, 192, 0, 51, 193, 0, 51, 193, 0, 51, 193, 0, 51, 193,
				0, 51, 193, 0, 49, 193, 0, 49, 193, 0, 49, 193, 0, 49, 0, 117, 77, 7, 117, 92, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119,
				84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 2, 119, 92, 0, 120, 89, 0, 115, 79, 5, 124, 84, 253, 255, 252, 254, 255, 250, 255, 254, 253,
				253, 252, 250, 255, 253, 255, 255, 248, 255, 244, 255, 255, 241, 255, 255, 254, 255, 255, 255, 245, 255, 247, 255, 255, 255, 251, 255,
				254, 255, 255, 255, 255, 250, 188, 2, 52, 197, 0, 52, 191, 0, 51, 190, 0, 51, 194, 0, 52, 187, 1, 48, 192, 0, 51, 192, 0, 51, 192, 0,
				51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 0, 116, 76, 5, 115, 90, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119,
				84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 115, 88, 0, 120, 89, 0, 120, 84, 3, 122, 82, 250, 252, 249, 255, 255, 251, 255,
				254, 253, 255, 255, 253, 255, 253, 255, 255, 248, 255, 247, 255, 255, 238, 255, 252, 254, 255, 255, 255, 244, 255, 241, 252, 255, 255,
				250, 254, 254, 255, 255, 255, 255, 250, 188, 2, 52, 197, 0, 52, 191, 0, 51, 190, 0, 51, 194, 0, 52, 187, 1, 48, 192, 0, 51, 192, 0,
				51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 0, 119, 77, 1, 116, 87, 0, 119, 84, 0, 119, 84, 0, 119,
				84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 117, 85, 0, 118, 83, 0, 120, 85, 0, 118, 83, 254, 255, 255, 255,
				255, 255, 253, 249, 250, 248, 248, 248, 255, 250, 231, 243, 255, 242, 255, 255, 250, 255, 255, 248, 252, 255, 251, 255, 247, 255, 238,
				255, 252, 254, 255, 248, 252, 255, 255, 255, 255, 250, 188, 2, 52, 197, 0, 52, 191, 0, 51, 191, 0, 51, 194, 0, 52, 188, 0, 48, 192, 0,
				51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 0, 122, 80, 1, 116, 87, 0, 119, 84, 0, 119,
				84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 1, 119, 87, 0, 119, 84, 3, 123, 88, 0, 116, 81, 251, 252,
				254, 255, 255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 236, 247, 255, 246, 246, 247, 241, 254, 251, 244, 243, 248, 242, 255, 247,
				255, 241, 255, 255, 253, 255, 247, 252, 255, 255, 255, 255, 250, 188, 2, 52, 197, 0, 52, 191, 0, 51, 191, 0, 51, 194, 0, 52, 188, 0,
				48, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 0, 124, 80, 0, 117, 87, 0, 119,
				84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 4, 123, 85, 0, 117, 80, 0, 118, 83, 0, 115,
				82, 254, 255, 255, 255, 255, 255, 255, 254, 252, 248, 250, 245, 224, 245, 226, 255, 205, 162, 214, 176, 95, 244, 178, 82, 255, 196,
				96, 250, 221, 181, 255, 253, 255, 247, 255, 239, 251, 255, 255, 255, 255, 250, 186, 2, 52, 197, 0, 52, 192, 0, 51, 191, 0, 51, 196, 0,
				52, 190, 0, 48, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 0, 123, 79, 0, 117,
				87, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 2, 121, 83, 0, 117, 80, 0, 117,
				82, 0, 115, 82, 254, 255, 255, 255, 255, 255, 255, 254, 252, 228, 230, 225, 86, 107, 88, 187, 130, 87, 183, 145, 64, 214, 148, 52,
				218, 159, 59, 189, 160, 120, 237, 232, 239, 251, 255, 243, 251, 255, 255, 255, 255, 250, 186, 2, 52, 197, 0, 52, 192, 0, 51, 191, 0,
				51, 196, 0, 52, 190, 0, 48, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 0, 123,
				77, 0, 118, 86, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 114, 76, 2, 124,
				87, 6, 124, 90, 0, 115, 82, 248, 249, 253, 248, 250, 245, 255, 255, 244, 224, 231, 213, 118, 177, 145, 229, 200, 156, 222, 161, 55,
				229, 145, 21, 220, 155, 27, 221, 149, 5, 239, 191, 83, 253, 246, 236, 251, 255, 255, 254, 255, 250, 186, 2, 52, 196, 0, 52, 192, 0,
				51, 191, 0, 51, 197, 0, 52, 190, 0, 48, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0,
				51, 0, 123, 77, 0, 119, 87, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 117,
				79, 1, 123, 86, 0, 116, 82, 0, 115, 82, 254, 255, 255, 254, 255, 251, 247, 249, 236, 159, 166, 148, 129, 188, 156, 254, 225, 181, 220,
				159, 53, 231, 147, 23, 215, 150, 22, 226, 154, 10, 203, 155, 47, 237, 230, 220, 251, 255, 255, 254, 255, 250, 186, 2, 52, 196, 0, 52,
				192, 0, 51, 191, 0, 51, 197, 0, 52, 190, 0, 48, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51,
				192, 0, 51, 0, 122, 79, 0, 118, 86, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0,
				118, 84, 2, 123, 88, 0, 117, 83, 2, 118, 83, 254, 255, 253, 216, 220, 206, 217, 222, 199, 166, 180, 147, 109, 118, 89, 232, 177, 157,
				230, 169, 78, 215, 153, 18, 202, 163, 44, 216, 153, 50, 201, 150, 71, 204, 201, 186, 217, 223, 221, 254, 255, 250, 185, 1, 51, 199, 2,
				55, 190, 0, 49, 194, 1, 54, 191, 0, 46, 191, 1, 49, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0,
				51, 192, 0, 51, 0, 122, 79, 0, 118, 86, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119,
				84, 0, 116, 82, 0, 114, 79, 3, 121, 87, 2, 118, 83, 252, 254, 251, 184, 188, 174, 154, 159, 136, 114, 128, 95, 123, 132, 103, 255,
				208, 188, 244, 183, 92, 232, 170, 35, 195, 156, 37, 224, 161, 58, 202, 151, 72, 199, 196, 181, 161, 167, 165, 243, 246, 239, 184, 0,
				50, 193, 0, 49, 189, 0, 48, 195, 2, 55, 197, 0, 52, 191, 1, 49, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0,
				51, 192, 0, 51, 192, 0, 51, 0, 119, 78, 3, 116, 86, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119,
				84, 0, 119, 84, 3, 121, 89, 0, 119, 86, 0, 116, 82, 7, 121, 85, 254, 255, 250, 220, 227, 211, 153, 161, 137, 134, 149, 118, 68, 90,
				78, 173, 169, 166, 209, 245, 235, 239, 228, 222, 174, 148, 111, 152, 132, 81, 137, 138, 107, 126, 170, 155, 144, 150, 148, 248, 249,
				243, 187, 3, 53, 193, 0, 48, 192, 0, 51, 193, 0, 53, 195, 0, 51, 191, 1, 49, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0,
				51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 0, 119, 78, 4, 117, 87, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119,
				84, 0, 119, 84, 0, 119, 84, 3, 121, 89, 0, 117, 84, 2, 120, 86, 0, 112, 76, 254, 255, 250, 244, 251, 235, 151, 159, 135, 172, 187,
				156, 151, 173, 161, 150, 146, 143, 64, 100, 90, 133, 122, 116, 133, 107, 70, 116, 96, 45, 136, 137, 106, 69, 113, 98, 190, 196, 194,
				255, 255, 250, 188, 4, 54, 195, 0, 50, 195, 3, 54, 191, 0, 51, 190, 0, 46, 192, 2, 50, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51,
				192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 0, 120, 81, 3, 118, 87, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0,
				119, 84, 0, 119, 84, 0, 119, 84, 0, 111, 82, 0, 120, 87, 0, 113, 78, 6, 120, 84, 254, 255, 253, 252, 255, 250, 241, 249, 238, 111,
				125, 110, 167, 200, 157, 168, 197, 192, 189, 146, 127, 181, 139, 81, 138, 177, 133, 191, 219, 207, 95, 135, 109, 137, 155, 143, 239,
				243, 242, 255, 255, 250, 188, 2, 52, 194, 0, 49, 192, 1, 52, 193, 0, 53, 188, 0, 46, 192, 4, 52, 192, 0, 51, 192, 0, 51, 192, 0, 51,
				192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 0, 120, 81, 3, 118, 87, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0,
				119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 7, 124, 95, 0, 121, 88, 1, 117, 82, 3, 117, 81, 250, 252, 249, 249, 254, 247, 251, 255,
				248, 210, 224, 209, 143, 176, 133, 93, 122, 117, 145, 102, 83, 148, 106, 48, 117, 156, 112, 77, 105, 93, 153, 193, 167, 240, 255, 246,
				252, 255, 255, 253, 252, 247, 191, 5, 55, 196, 0, 51, 188, 0, 48, 196, 3, 56, 192, 0, 50, 190, 2, 50, 192, 0, 51, 192, 0, 51, 192, 0,
				51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 0, 120, 80, 0, 118, 86, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119,
				84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 114, 82, 0, 118, 83, 0, 112, 77, 10, 124, 88, 251, 252, 254, 252, 255, 255,
				251, 255, 255, 238, 252, 255, 241, 255, 247, 217, 224, 234, 176, 171, 151, 133, 126, 100, 175, 191, 207, 243, 228, 247, 254, 255, 232,
				255, 251, 242, 254, 255, 255, 254, 253, 248, 191, 5, 55, 197, 0, 52, 190, 0, 50, 192, 1, 53, 194, 0, 52, 186, 0, 47, 192, 0, 51, 192,
				0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 0, 119, 79, 0, 117, 85, 0, 119, 84, 0, 119, 84, 0, 119,
				84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 119, 84, 0, 118, 86, 0, 120, 85, 2, 118, 83, 1, 115, 79, 254, 255, 255, 249,
				253, 255, 251, 255, 255, 245, 255, 255, 245, 255, 251, 245, 252, 255, 255, 255, 236, 255, 255, 230, 242, 255, 255, 255, 241, 255, 255,
				255, 234, 255, 255, 246, 253, 255, 254, 255, 255, 250, 184, 0, 48, 196, 0, 51, 193, 2, 53, 187, 0, 48, 195, 1, 53, 187, 1, 48, 192, 0,
				51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 51, 9, 114, 100, 0, 117, 83, 0, 118, 86, 0, 118,
				86, 0, 118, 86, 0, 118, 86, 0, 119, 84, 0, 119, 83, 0, 119, 83, 0, 119, 83, 0, 122, 83, 0, 120, 84, 3, 117, 84, 1, 116, 83, 255, 253,
				255, 252, 255, 255, 254, 255, 253, 252, 255, 250, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 254, 255, 252, 255, 255, 254, 255, 251, 189, 0, 56, 190, 2, 53, 193, 0, 49, 192, 0, 48, 189, 3, 52, 187, 1,
				50, 196, 0, 51, 195, 0, 51, 193, 0, 49, 192, 0, 49, 192, 0, 49, 192, 0, 49, 193, 0, 49, 195, 0, 49, 8, 113, 99, 0, 117, 83, 0, 118,
				86, 0, 118, 86, 0, 118, 86, 0, 118, 86, 0, 119, 84, 0, 119, 83, 0, 119, 83, 0, 119, 83, 0, 122, 83, 0, 120, 84, 3, 117, 84, 1, 116,
				83, 255, 253, 255, 252, 255, 255, 254, 255, 253, 252, 255, 250, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 252, 255, 255, 254, 255, 251, 189, 0, 56, 190, 2, 53, 193, 0, 49, 192, 0, 48, 189,
				3, 52, 187, 1, 50, 196, 0, 51, 195, 0, 51, 193, 0, 49, 192, 0, 49, 192, 0, 49, 192, 0, 49, 193, 0, 49, 195, 0, 49, 3, 117, 92, 0, 122,
				78, 2, 118, 83, 2, 117, 84, 2, 117, 84, 2, 117, 84, 2, 117, 86, 2, 117, 86, 2, 117, 86, 2, 117, 86, 0, 121, 86, 0, 118, 86, 7, 114,
				84, 4, 115, 83, 252, 255, 255, 248, 255, 255, 255, 255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254,
				255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 252, 255, 255, 254, 255, 251, 199, 0, 56, 192, 1, 53, 191, 0, 51,
				197, 0, 48, 187, 4, 52, 202, 0, 51, 192, 0, 51, 192, 0, 51, 191, 0, 51, 189, 1, 51, 189, 1, 51, 191, 0, 51, 191, 0, 51, 192, 0, 51, 2,
				116, 91, 0, 122, 78, 2, 118, 83, 2, 117, 84, 2, 117, 84, 2, 117, 84, 2, 117, 86, 2, 117, 86, 2, 117, 86, 2, 117, 86, 0, 121, 86, 0,
				118, 86, 7, 114, 84, 4, 115, 83, 252, 255, 255, 248, 255, 255, 255, 255, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255,
				255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 252, 255, 255, 254, 255, 251, 199, 0, 56, 192, 1, 53,
				191, 0, 51, 197, 0, 48, 187, 4, 52, 202, 0, 51, 192, 0, 51, 192, 0, 51, 191, 0, 51, 189, 1, 51, 189, 1, 51, 191, 0, 51, 191, 0, 51,
				192, 0, 51, 3, 117, 91, 0, 123, 76, 0, 121, 84, 0, 121, 84, 0, 121, 84, 0, 120, 84, 0, 120, 86, 0, 120, 86, 0, 119, 88, 0, 119, 88, 9,
				113, 86, 0, 118, 84, 0, 121, 81, 1, 117, 78, 254, 255, 255, 255, 253, 255, 255, 252, 255, 251, 255, 255, 255, 254, 255, 255, 254, 255,
				255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 252, 255, 253, 255, 255, 251, 198, 0, 56,
				187, 3, 53, 184, 4, 51, 194, 0, 50, 182, 6, 53, 205, 0, 51, 193, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 52, 192, 0, 52, 192, 0, 52,
				193, 0, 52, 193, 0, 52, 3, 117, 91, 0, 123, 76, 0, 121, 84, 0, 121, 84, 0, 121, 84, 0, 120, 84, 0, 120, 86, 0, 120, 86, 0, 119, 88, 0,
				119, 88, 9, 113, 86, 0, 118, 84, 0, 121, 81, 1, 117, 78, 254, 255, 255, 255, 253, 255, 255, 252, 255, 251, 255, 255, 255, 254, 255,
				255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 252, 255, 253, 255, 255, 251,
				198, 0, 56, 187, 3, 53, 184, 4, 51, 194, 0, 50, 182, 6, 53, 205, 0, 51, 193, 0, 51, 192, 0, 51, 192, 0, 51, 192, 0, 52, 192, 0, 52,
				192, 0, 52, 193, 0, 52, 193, 0, 52, 16, 109, 98, 8, 112, 85, 0, 118, 90, 0, 119, 88, 0, 119, 86, 0, 119, 84, 0, 119, 83, 0, 119, 83,
				0, 119, 83, 0, 119, 83, 2, 118, 83, 0, 123, 79, 0, 125, 75, 0, 120, 71, 241, 255, 248, 255, 255, 251, 255, 253, 255, 252, 255, 255,
				254, 255, 255, 254, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 253, 255, 255, 253, 255, 255, 253, 254, 255, 251,
				255, 250, 250, 185, 2, 56, 193, 0, 55, 196, 0, 52, 199, 0, 51, 185, 5, 53, 194, 0, 53, 188, 2, 52, 188, 2, 52, 188, 2, 52, 188, 2, 52,
				189, 0, 54, 189, 0, 54, 191, 0, 54, 191, 0, 54, 15, 108, 97, 7, 111, 84, 0, 118, 90, 0, 119, 88, 0, 119, 86, 0, 119, 84, 0, 119, 83,
				0, 119, 83, 0, 119, 83, 0, 119, 83, 2, 118, 83, 0, 123, 79, 0, 125, 75, 0, 120, 71, 241, 255, 248, 255, 255, 251, 255, 253, 255, 252,
				255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 253, 255, 255, 253, 255, 255, 253, 254,
				255, 251, 255, 250, 250, 185, 2, 56, 193, 0, 55, 196, 0, 52, 199, 0, 51, 185, 5, 53, 194, 0, 53, 188, 2, 52, 188, 2, 52, 188, 2, 52,
				188, 2, 52, 189, 0, 54, 189, 0, 54, 191, 0, 54, 191, 0, 54,
			]
		),
	},
	{
		c: "mt",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				146, 142, 106, 187, 182, 150, 209, 204, 173, 224, 219, 190, 232, 227, 200, 217, 213, 187, 203, 199, 175, 201, 196, 176, 213, 208, 188,
				226, 221, 202, 233, 227, 211, 234, 228, 213, 234, 228, 214, 234, 228, 214, 234, 228, 212, 234, 229, 209, 237, 231, 207, 238, 229, 202,
				237, 225, 196, 231, 214, 184, 230, 207, 178, 227, 195, 168, 169, 128, 103, 147, 97, 73, 152, 93, 69, 152, 84, 63, 154, 79, 59, 159,
				77, 58, 162, 75, 57, 165, 74, 56, 165, 72, 54, 165, 71, 53, 164, 71, 53, 164, 73, 54, 164, 74, 55, 163, 75, 55, 163, 77, 57, 161, 77,
				56, 157, 77, 55, 149, 79, 54, 142, 87, 58, 136, 94, 62, 147, 142, 109, 199, 194, 164, 228, 225, 198, 240, 238, 213, 229, 224, 202,
				207, 202, 182, 190, 185, 167, 189, 183, 167, 207, 201, 186, 228, 222, 209, 243, 237, 224, 248, 242, 231, 248, 244, 233, 248, 245, 234,
				248, 245, 233, 248, 245, 231, 249, 245, 228, 250, 245, 225, 249, 243, 221, 247, 234, 211, 247, 227, 203, 241, 213, 190, 174, 126, 105,
				148, 86, 66, 154, 81, 62, 158, 73, 57, 163, 70, 55, 171, 71, 57, 174, 71, 56, 175, 69, 55, 175, 68, 53, 175, 67, 52, 175, 67, 52, 176,
				67, 53, 176, 68, 53, 176, 69, 54, 175, 71, 55, 173, 71, 54, 169, 72, 54, 161, 73, 53, 151, 78, 54, 142, 83, 55, 149, 143, 114, 213,
				207, 180, 235, 231, 207, 238, 235, 214, 219, 212, 195, 187, 180, 166, 165, 158, 146, 169, 162, 151, 193, 185, 175, 218, 211, 202, 235,
				228, 220, 247, 242, 234, 255, 252, 245, 255, 253, 246, 255, 253, 245, 255, 253, 243, 255, 252, 243, 255, 252, 241, 255, 251, 238, 255,
				245, 230, 255, 237, 219, 248, 218, 200, 180, 125, 108, 154, 81, 65, 160, 73, 58, 168, 67, 55, 175, 65, 53, 181, 65, 53, 181, 66, 53,
				181, 66, 53, 180, 65, 51, 181, 64, 51, 182, 63, 51, 184, 63, 52, 186, 62, 52, 186, 63, 52, 186, 64, 52, 183, 65, 52, 179, 66, 52, 172,
				68, 52, 163, 72, 52, 154, 77, 54, 154, 146, 120, 227, 219, 198, 230, 223, 203, 219, 212, 196, 202, 194, 182, 158, 149, 141, 129, 120,
				113, 142, 133, 128, 170, 161, 156, 197, 189, 184, 211, 202, 199, 234, 229, 226, 255, 253, 250, 255, 252, 249, 255, 252, 249, 255, 252,
				249, 255, 253, 252, 255, 252, 251, 255, 250, 247, 255, 249, 241, 255, 238, 226, 249, 213, 200, 187, 126, 114, 164, 81, 70, 169, 67,
				57, 181, 65, 56, 187, 62, 53, 188, 57, 47, 185, 60, 48, 184, 62, 49, 183, 63, 49, 184, 62, 50, 186, 60, 51, 190, 59, 51, 192, 58, 51,
				194, 57, 50, 194, 57, 49, 191, 59, 49, 186, 61, 49, 181, 64, 49, 177, 68, 53, 172, 74, 58, 148, 141, 116, 209, 202, 181, 203, 195,
				179, 184, 176, 163, 158, 149, 140, 120, 111, 104, 96, 87, 82, 109, 99, 97, 134, 126, 123, 160, 152, 149, 177, 169, 167, 214, 207, 205,
				249, 243, 241, 254, 247, 245, 255, 250, 248, 255, 252, 251, 255, 253, 254, 255, 252, 254, 255, 251, 252, 255, 249, 246, 255, 238, 230,
				249, 213, 202, 189, 125, 116, 167, 79, 70, 173, 65, 56, 186, 62, 55, 192, 59, 52, 193, 55, 46, 189, 59, 47, 186, 61, 48, 184, 62, 48,
				186, 61, 50, 189, 60, 51, 192, 58, 51, 196, 56, 50, 199, 54, 49, 199, 54, 49, 195, 56, 48, 190, 59, 48, 185, 62, 49, 182, 63, 50, 176,
				66, 52, 145, 138, 114, 199, 192, 172, 189, 181, 166, 166, 158, 146, 134, 125, 117, 97, 88, 82, 74, 66, 61, 86, 76, 74, 111, 103, 101,
				139, 132, 130, 160, 153, 151, 204, 197, 195, 245, 238, 237, 253, 245, 243, 255, 250, 249, 255, 253, 253, 255, 253, 254, 255, 252, 255,
				255, 251, 254, 255, 249, 248, 255, 238, 232, 249, 213, 204, 190, 124, 116, 169, 78, 70, 176, 64, 55, 189, 61, 54, 195, 58, 51, 195,
				54, 45, 190, 58, 46, 187, 61, 47, 185, 62, 47, 187, 61, 50, 190, 59, 51, 194, 57, 51, 198, 55, 50, 201, 53, 49, 201, 53, 49, 197, 55,
				48, 192, 58, 47, 188, 61, 49, 184, 60, 49, 178, 62, 50, 145, 139, 115, 197, 190, 170, 189, 181, 165, 165, 157, 146, 130, 121, 113, 90,
				82, 75, 64, 57, 51, 72, 64, 61, 101, 95, 92, 134, 129, 127, 160, 155, 154, 203, 197, 197, 243, 237, 237, 251, 246, 244, 254, 251, 249,
				255, 254, 253, 255, 253, 255, 255, 252, 255, 255, 251, 254, 255, 249, 248, 255, 238, 232, 249, 213, 204, 190, 124, 116, 169, 78, 70,
				176, 64, 55, 189, 61, 54, 195, 58, 51, 195, 54, 45, 190, 58, 46, 187, 61, 47, 185, 62, 47, 187, 61, 50, 190, 59, 51, 194, 57, 51, 198,
				55, 50, 201, 53, 49, 201, 53, 49, 197, 55, 48, 192, 58, 47, 188, 61, 49, 185, 61, 50, 180, 63, 51, 148, 142, 118, 210, 203, 184, 214,
				207, 191, 207, 200, 188, 196, 188, 180, 151, 145, 139, 116, 111, 106, 116, 110, 107, 149, 143, 141, 185, 180, 177, 206, 200, 200, 230,
				226, 226, 250, 247, 246, 249, 244, 241, 251, 248, 246, 255, 253, 254, 255, 253, 255, 255, 252, 255, 255, 251, 254, 255, 249, 248, 255,
				238, 232, 249, 213, 204, 190, 124, 116, 169, 78, 70, 176, 64, 55, 189, 61, 54, 195, 58, 51, 195, 54, 45, 190, 58, 46, 187, 61, 47,
				185, 62, 47, 187, 61, 50, 190, 59, 51, 194, 57, 51, 198, 55, 50, 201, 53, 49, 201, 53, 49, 197, 55, 48, 192, 58, 47, 188, 61, 49, 187,
				63, 51, 183, 66, 54, 149, 145, 120, 219, 213, 194, 233, 228, 212, 236, 230, 218, 230, 224, 216, 187, 181, 176, 151, 146, 142, 148,
				143, 140, 182, 178, 175, 219, 215, 213, 237, 232, 231, 248, 245, 244, 254, 253, 251, 249, 245, 243, 251, 247, 247, 255, 253, 254, 255,
				253, 255, 255, 252, 255, 255, 251, 254, 255, 249, 248, 255, 238, 232, 249, 213, 204, 190, 124, 116, 169, 78, 70, 176, 64, 55, 189, 61,
				54, 195, 58, 51, 195, 54, 45, 190, 58, 46, 187, 61, 47, 185, 62, 47, 187, 61, 50, 190, 59, 51, 194, 57, 51, 198, 55, 50, 201, 53, 49,
				201, 53, 49, 197, 55, 48, 192, 58, 47, 188, 61, 49, 187, 63, 52, 183, 67, 55, 148, 145, 120, 223, 218, 198, 244, 241, 226, 246, 243,
				232, 223, 219, 212, 187, 183, 178, 160, 157, 152, 160, 156, 153, 194, 192, 189, 230, 229, 227, 246, 243, 242, 253, 251, 249, 255, 254,
				252, 252, 249, 248, 253, 251, 250, 255, 254, 255, 255, 254, 255, 255, 253, 255, 255, 251, 254, 255, 249, 248, 255, 238, 232, 249, 213,
				204, 190, 124, 116, 169, 78, 70, 176, 64, 55, 189, 61, 54, 195, 58, 51, 195, 54, 45, 190, 58, 46, 187, 61, 47, 185, 62, 47, 187, 61,
				50, 190, 59, 51, 194, 57, 51, 198, 55, 50, 201, 53, 49, 201, 53, 49, 197, 55, 48, 192, 58, 47, 188, 61, 49, 186, 62, 51, 181, 65, 53,
				148, 146, 122, 219, 216, 196, 242, 240, 224, 250, 248, 237, 242, 238, 231, 225, 222, 216, 211, 210, 205, 210, 208, 205, 227, 226, 224,
				245, 244, 242, 247, 245, 243, 251, 250, 248, 255, 254, 252, 253, 251, 249, 253, 251, 251, 254, 253, 254, 255, 254, 255, 255, 253, 255,
				255, 251, 254, 255, 249, 248, 255, 238, 232, 249, 213, 204, 190, 124, 116, 169, 78, 70, 176, 64, 55, 189, 61, 54, 195, 58, 51, 195,
				54, 45, 190, 58, 46, 187, 61, 47, 185, 62, 47, 187, 61, 50, 190, 59, 51, 194, 57, 51, 198, 55, 50, 201, 53, 49, 201, 53, 49, 197, 55,
				48, 192, 58, 47, 188, 61, 49, 185, 61, 50, 179, 63, 51, 147, 147, 123, 216, 213, 193, 240, 238, 222, 251, 250, 238, 251, 249, 241,
				249, 248, 242, 246, 245, 241, 244, 243, 241, 249, 249, 247, 252, 252, 250, 245, 244, 243, 249, 249, 247, 254, 255, 253, 253, 253, 251,
				253, 253, 252, 254, 254, 254, 255, 254, 255, 255, 253, 255, 255, 251, 254, 255, 249, 248, 255, 238, 232, 249, 213, 204, 190, 124, 116,
				169, 78, 70, 176, 64, 55, 189, 61, 54, 195, 58, 51, 195, 54, 45, 190, 58, 46, 187, 61, 47, 185, 62, 47, 187, 61, 50, 190, 59, 51, 194,
				57, 51, 198, 55, 50, 201, 53, 49, 201, 53, 49, 197, 55, 48, 192, 58, 47, 188, 61, 49, 185, 61, 49, 179, 63, 50, 145, 147, 122, 212,
				212, 191, 238, 238, 221, 249, 249, 237, 245, 245, 237, 250, 250, 243, 254, 254, 249, 252, 251, 249, 252, 252, 250, 251, 250, 249, 241,
				241, 240, 246, 247, 246, 254, 255, 255, 255, 255, 253, 255, 255, 254, 255, 255, 255, 255, 254, 255, 255, 253, 255, 255, 251, 254, 255,
				249, 248, 255, 238, 232, 249, 213, 204, 190, 124, 116, 169, 78, 70, 176, 64, 55, 189, 61, 54, 195, 58, 51, 195, 54, 45, 190, 58, 46,
				187, 61, 47, 185, 62, 47, 187, 61, 50, 190, 59, 51, 194, 57, 51, 198, 55, 50, 201, 53, 49, 201, 53, 49, 197, 55, 48, 192, 58, 47, 188,
				61, 49, 185, 61, 50, 180, 64, 52, 139, 142, 117, 208, 208, 189, 237, 238, 222, 252, 252, 240, 248, 249, 240, 252, 252, 246, 253, 253,
				249, 246, 246, 243, 249, 249, 247, 251, 252, 250, 245, 246, 246, 249, 250, 250, 254, 255, 255, 254, 255, 253, 253, 254, 252, 251, 252,
				252, 254, 254, 254, 255, 253, 255, 255, 251, 254, 255, 249, 248, 255, 238, 232, 249, 213, 204, 190, 124, 116, 169, 78, 70, 176, 64,
				55, 189, 61, 54, 195, 58, 51, 195, 54, 45, 190, 58, 46, 187, 61, 47, 185, 62, 47, 187, 61, 50, 190, 59, 51, 194, 57, 51, 198, 55, 50,
				201, 53, 49, 201, 53, 49, 197, 55, 48, 192, 58, 47, 188, 61, 49, 185, 62, 50, 181, 65, 52, 137, 140, 115, 206, 207, 188, 238, 238,
				224, 254, 254, 243, 251, 252, 244, 253, 253, 248, 252, 252, 248, 244, 244, 242, 248, 248, 246, 252, 253, 251, 250, 252, 250, 252, 253,
				253, 254, 255, 255, 254, 255, 254, 252, 253, 252, 250, 252, 251, 254, 253, 254, 255, 253, 255, 255, 251, 254, 255, 249, 248, 255, 238,
				232, 249, 213, 204, 190, 124, 116, 169, 78, 70, 176, 64, 55, 189, 61, 54, 195, 58, 51, 195, 54, 45, 190, 58, 46, 187, 61, 47, 185, 62,
				47, 187, 61, 50, 190, 59, 51, 194, 57, 51, 198, 55, 50, 201, 53, 49, 201, 53, 49, 197, 55, 48, 192, 58, 47, 188, 61, 49, 185, 61, 50,
				180, 64, 52, 142, 145, 121, 208, 211, 191, 238, 240, 225, 254, 255, 245, 253, 254, 247, 253, 254, 248, 253, 254, 249, 251, 253, 250,
				252, 254, 252, 253, 255, 254, 253, 255, 254, 253, 255, 254, 254, 255, 255, 253, 255, 255, 253, 255, 255, 254, 254, 254, 255, 254, 255,
				255, 253, 255, 255, 251, 254, 255, 249, 248, 255, 238, 232, 249, 213, 204, 190, 124, 116, 169, 78, 70, 176, 64, 55, 189, 61, 54, 195,
				58, 51, 195, 54, 45, 190, 58, 46, 187, 61, 47, 185, 62, 47, 187, 61, 50, 190, 59, 51, 194, 57, 51, 198, 55, 50, 201, 53, 49, 201, 53,
				49, 197, 55, 48, 192, 58, 47, 188, 61, 49, 184, 61, 49, 179, 63, 51, 144, 147, 123, 209, 212, 192, 239, 240, 226, 255, 255, 245, 253,
				254, 248, 253, 254, 249, 253, 254, 251, 252, 254, 252, 253, 255, 253, 253, 255, 254, 253, 255, 254, 253, 255, 254, 254, 255, 255, 252,
				255, 255, 253, 255, 255, 254, 255, 255, 255, 254, 255, 255, 253, 255, 255, 251, 254, 255, 249, 248, 255, 238, 232, 249, 213, 204, 190,
				124, 116, 169, 78, 70, 176, 64, 55, 189, 61, 54, 195, 58, 51, 195, 54, 45, 190, 58, 46, 187, 61, 47, 185, 62, 47, 187, 61, 50, 190,
				59, 51, 194, 57, 51, 198, 55, 50, 201, 53, 49, 201, 53, 49, 197, 55, 48, 192, 58, 47, 188, 61, 49, 184, 60, 49, 179, 63, 51, 145, 147,
				124, 209, 212, 193, 239, 240, 226, 254, 255, 245, 253, 254, 248, 253, 253, 250, 253, 253, 251, 252, 254, 253, 253, 254, 254, 253, 255,
				254, 253, 255, 254, 253, 255, 255, 254, 255, 255, 253, 255, 255, 253, 255, 255, 254, 255, 255, 255, 254, 255, 255, 253, 255, 255, 251,
				254, 255, 249, 248, 255, 238, 232, 249, 213, 204, 190, 124, 116, 169, 78, 70, 176, 64, 55, 189, 61, 54, 195, 58, 51, 195, 54, 45, 190,
				58, 46, 187, 61, 47, 185, 62, 47, 187, 61, 50, 190, 59, 51, 194, 57, 51, 198, 55, 50, 201, 53, 49, 201, 53, 49, 197, 55, 48, 192, 58,
				47, 188, 61, 49, 184, 61, 49, 180, 63, 51, 144, 146, 123, 209, 211, 192, 238, 239, 224, 254, 254, 244, 253, 254, 247, 253, 253, 250,
				253, 253, 251, 253, 253, 253, 253, 254, 254, 254, 254, 255, 253, 254, 255, 253, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255,
				254, 255, 255, 255, 254, 255, 255, 253, 255, 255, 251, 254, 255, 249, 248, 255, 238, 232, 249, 213, 204, 190, 124, 116, 169, 78, 70,
				176, 64, 55, 189, 61, 54, 195, 58, 51, 195, 54, 45, 190, 58, 46, 187, 61, 47, 185, 62, 47, 187, 61, 50, 190, 59, 51, 194, 57, 51, 198,
				55, 50, 201, 53, 49, 201, 53, 49, 197, 55, 48, 192, 58, 47, 188, 61, 49, 185, 61, 49, 180, 64, 52, 144, 145, 123, 209, 210, 193, 239,
				239, 225, 254, 254, 244, 254, 254, 247, 253, 253, 250, 253, 253, 251, 253, 253, 253, 254, 254, 254, 254, 254, 255, 254, 254, 255, 254,
				254, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 255, 254, 255, 255, 253, 255, 255, 251, 254, 255, 249, 248, 255,
				238, 232, 249, 213, 204, 190, 124, 116, 169, 78, 70, 176, 64, 55, 189, 61, 54, 195, 58, 51, 195, 54, 45, 190, 58, 46, 187, 61, 47,
				185, 62, 47, 187, 61, 50, 190, 59, 51, 194, 57, 51, 198, 55, 50, 201, 53, 49, 201, 53, 49, 197, 55, 48, 192, 58, 47, 188, 61, 49, 185,
				61, 49, 180, 64, 51, 144, 146, 124, 210, 210, 194, 239, 239, 227, 255, 255, 245, 254, 253, 248, 254, 253, 250, 253, 253, 251, 253,
				253, 253, 254, 253, 254, 254, 254, 255, 254, 254, 255, 254, 254, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 255,
				254, 255, 255, 253, 255, 255, 251, 254, 255, 249, 248, 255, 238, 232, 249, 213, 204, 190, 124, 116, 169, 78, 70, 176, 64, 55, 189, 61,
				54, 195, 58, 51, 195, 54, 45, 190, 58, 46, 187, 61, 47, 185, 62, 47, 187, 61, 50, 190, 59, 51, 194, 57, 51, 198, 55, 50, 201, 53, 49,
				201, 53, 49, 197, 55, 48, 192, 58, 47, 188, 61, 49, 184, 60, 49, 179, 63, 51, 147, 147, 125, 213, 211, 195, 240, 240, 228, 255, 255,
				246, 254, 253, 249, 254, 253, 250, 254, 253, 251, 254, 252, 253, 254, 253, 254, 254, 254, 255, 254, 254, 255, 254, 254, 255, 255, 255,
				255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 255, 254, 255, 255, 253, 255, 255, 251, 254, 255, 249, 248, 255, 238, 232, 249, 213,
				204, 190, 124, 116, 169, 78, 70, 176, 64, 55, 189, 61, 54, 195, 58, 51, 195, 54, 45, 190, 58, 46, 187, 61, 47, 185, 62, 47, 187, 61,
				50, 190, 59, 51, 194, 57, 51, 198, 55, 50, 201, 53, 49, 201, 53, 49, 197, 55, 48, 192, 58, 47, 188, 61, 49, 183, 60, 48, 178, 62, 50,
				146, 144, 124, 211, 209, 193, 239, 238, 226, 254, 253, 245, 255, 253, 248, 254, 253, 250, 254, 253, 252, 254, 252, 254, 254, 253, 255,
				255, 253, 255, 255, 253, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 255, 254, 255, 255, 254, 255, 255, 253, 255,
				255, 251, 254, 255, 249, 248, 255, 238, 232, 249, 213, 204, 190, 124, 116, 169, 78, 70, 176, 64, 55, 189, 61, 54, 195, 58, 51, 195,
				54, 45, 190, 58, 46, 187, 61, 47, 185, 62, 47, 187, 61, 50, 190, 59, 51, 194, 57, 51, 198, 55, 50, 201, 53, 49, 201, 53, 49, 197, 55,
				48, 192, 58, 47, 188, 61, 49, 183, 59, 48, 178, 62, 49, 144, 142, 122, 209, 206, 191, 238, 235, 224, 254, 251, 243, 255, 252, 248,
				255, 252, 250, 254, 253, 252, 254, 252, 254, 255, 252, 255, 255, 253, 255, 255, 253, 255, 255, 254, 255, 255, 255, 255, 255, 255, 255,
				255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 253, 255, 255, 251, 254, 255, 249, 248, 255, 238, 232, 249, 213, 204, 190, 124, 116,
				169, 78, 70, 176, 64, 55, 189, 61, 54, 195, 58, 51, 195, 54, 45, 190, 58, 46, 187, 61, 47, 185, 62, 47, 187, 61, 50, 190, 59, 51, 194,
				57, 51, 198, 55, 50, 201, 53, 49, 201, 53, 49, 197, 55, 48, 192, 58, 47, 188, 61, 49, 183, 59, 48, 178, 62, 50, 143, 140, 121, 208,
				205, 189, 237, 234, 222, 253, 250, 242, 255, 252, 248, 255, 252, 250, 255, 252, 252, 255, 251, 254, 255, 252, 255, 255, 253, 255, 255,
				253, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 253, 255, 255, 251, 254, 255,
				249, 248, 255, 238, 232, 249, 213, 204, 190, 124, 116, 169, 78, 70, 176, 64, 55, 189, 61, 54, 195, 58, 51, 195, 54, 45, 190, 58, 46,
				187, 61, 47, 185, 62, 47, 187, 61, 50, 190, 59, 51, 194, 57, 51, 198, 55, 50, 201, 53, 49, 201, 53, 49, 197, 55, 48, 192, 58, 47, 188,
				61, 49, 184, 60, 48, 178, 62, 50, 146, 143, 122, 211, 208, 191, 239, 237, 223, 254, 252, 242, 255, 252, 246, 255, 252, 248, 255, 252,
				249, 255, 252, 251, 255, 253, 252, 255, 253, 253, 255, 253, 253, 255, 254, 253, 255, 254, 253, 255, 254, 253, 255, 254, 253, 255, 254,
				253, 255, 254, 254, 255, 253, 253, 255, 251, 251, 255, 250, 246, 255, 238, 230, 249, 213, 203, 187, 126, 116, 163, 80, 71, 168, 67,
				57, 180, 65, 56, 186, 62, 53, 186, 58, 48, 182, 62, 49, 180, 64, 50, 178, 65, 50, 180, 64, 52, 182, 63, 52, 185, 61, 52, 190, 59, 52,
				192, 57, 51, 192, 57, 51, 188, 59, 50, 184, 62, 50, 180, 64, 51, 175, 64, 51, 170, 67, 52, 150, 147, 122, 209, 206, 185, 234, 233,
				215, 248, 247, 233, 249, 247, 235, 249, 247, 237, 249, 247, 238, 248, 246, 239, 248, 246, 240, 248, 246, 241, 248, 246, 241, 248, 246,
				241, 248, 247, 242, 248, 247, 242, 248, 246, 242, 248, 246, 242, 248, 246, 242, 248, 245, 241, 249, 244, 238, 249, 243, 234, 248, 231,
				219, 240, 206, 193, 180, 128, 115, 155, 86, 73, 157, 72, 60, 167, 71, 59, 172, 69, 57, 173, 66, 54, 171, 69, 55, 169, 70, 55, 168, 71,
				55, 169, 70, 56, 170, 69, 56, 173, 68, 56, 176, 66, 56, 179, 65, 56, 179, 65, 55, 176, 67, 55, 172, 69, 55, 168, 71, 55, 163, 73, 56,
				158, 77, 57, 148, 146, 117, 179, 178, 151, 200, 199, 175, 215, 213, 191, 220, 218, 197, 220, 218, 199, 219, 217, 199, 218, 215, 198,
				216, 214, 198, 215, 213, 198, 215, 212, 198, 214, 212, 198, 213, 212, 199, 214, 212, 199, 215, 212, 199, 215, 212, 197, 215, 210, 195,
				219, 212, 196, 223, 215, 197, 223, 211, 192, 214, 196, 176, 198, 173, 152, 167, 131, 111, 148, 102, 82, 139, 83, 65, 144, 81, 63, 152,
				83, 65, 160, 87, 70, 155, 84, 66, 152, 82, 64, 152, 82, 64, 152, 82, 65, 154, 81, 65, 156, 81, 66, 157, 81, 66, 158, 81, 66, 158, 81,
				65, 157, 82, 66, 155, 83, 66, 151, 85, 66, 148, 92, 68, 144, 98, 70,
			]
		),
	},
	{
		c: "no",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				97, 58, 43, 122, 73, 51, 140, 81, 54, 153, 85, 53, 162, 88, 53, 166, 90, 54, 161, 86, 51, 160, 90, 58, 151, 88, 61, 148, 92, 70, 167,
				118, 101, 192, 153, 142, 179, 155, 156, 102, 95, 110, 55, 54, 72, 88, 77, 89, 169, 146, 150, 192, 157, 150, 168, 121, 104, 147, 89,
				65, 152, 86, 57, 155, 86, 51, 156, 84, 50, 157, 83, 50, 157, 83, 51, 156, 83, 51, 156, 83, 52, 156, 83, 52, 156, 83, 52, 157, 83, 52,
				156, 83, 53, 155, 84, 55, 154, 84, 57, 155, 83, 59, 158, 82, 61, 158, 82, 62, 157, 81, 63, 155, 81, 65, 151, 82, 67, 145, 84, 68, 138,
				86, 71, 128, 86, 72, 114, 60, 37, 150, 84, 55, 173, 96, 62, 181, 95, 55, 186, 93, 51, 190, 95, 52, 185, 92, 49, 182, 96, 55, 172, 94,
				59, 170, 101, 71, 197, 136, 110, 231, 182, 164, 217, 186, 183, 117, 107, 123, 49, 46, 66, 90, 77, 89, 195, 167, 170, 226, 183, 174,
				193, 137, 117, 164, 95, 66, 171, 92, 55, 179, 93, 50, 182, 92, 47, 185, 92, 46, 185, 92, 45, 185, 92, 45, 185, 91, 46, 185, 91, 46,
				185, 92, 45, 186, 91, 45, 185, 91, 47, 183, 92, 49, 181, 93, 52, 181, 93, 55, 183, 92, 57, 183, 92, 59, 183, 91, 61, 180, 91, 63, 175,
				92, 66, 168, 93, 69, 163, 98, 75, 157, 107, 85, 119, 58, 33, 161, 86, 56, 184, 97, 61, 190, 92, 51, 192, 88, 43, 196, 89, 44, 190, 86,
				41, 188, 92, 49, 176, 90, 53, 174, 98, 66, 201, 135, 108, 236, 185, 167, 222, 192, 191, 115, 110, 131, 34, 37, 65, 80, 72, 91, 194,
				171, 178, 228, 187, 182, 194, 136, 118, 164, 92, 62, 174, 90, 51, 183, 89, 42, 191, 91, 41, 195, 91, 38, 197, 90, 37, 197, 90, 36,
				198, 90, 36, 198, 89, 37, 198, 90, 36, 199, 90, 36, 198, 90, 36, 197, 90, 36, 196, 91, 39, 196, 91, 41, 199, 89, 43, 199, 89, 44, 198,
				88, 47, 195, 89, 50, 189, 90, 54, 181, 92, 58, 175, 99, 67, 170, 109, 81, 122, 60, 37, 167, 88, 60, 186, 94, 59, 194, 91, 51, 200, 89,
				45, 202, 89, 44, 195, 86, 42, 195, 94, 53, 182, 93, 59, 177, 100, 70, 201, 136, 111, 233, 184, 169, 217, 192, 197, 110, 114, 144, 29,
				41, 80, 78, 78, 105, 193, 176, 191, 228, 191, 192, 194, 140, 126, 167, 95, 69, 179, 92, 55, 186, 88, 41, 196, 90, 39, 201, 90, 36,
				203, 89, 34, 205, 89, 33, 205, 89, 32, 205, 89, 33, 205, 89, 32, 206, 89, 31, 205, 89, 30, 206, 89, 29, 206, 89, 29, 208, 88, 30, 210,
				88, 32, 211, 87, 33, 210, 86, 35, 207, 87, 38, 200, 88, 42, 191, 90, 48, 183, 96, 57, 174, 103, 68, 126, 62, 43, 171, 89, 64, 186, 91,
				60, 195, 88, 51, 202, 88, 47, 203, 87, 45, 196, 85, 44, 197, 95, 56, 184, 95, 64, 176, 100, 74, 197, 134, 112, 226, 180, 169, 207,
				188, 198, 101, 111, 149, 28, 46, 93, 77, 82, 117, 190, 177, 199, 224, 192, 198, 194, 141, 133, 168, 97, 74, 178, 90, 55, 184, 84, 40,
				194, 86, 37, 199, 86, 33, 202, 85, 30, 203, 85, 29, 203, 85, 28, 203, 85, 30, 203, 85, 30, 203, 85, 29, 204, 85, 27, 205, 85, 24, 207,
				85, 22, 209, 85, 22, 212, 84, 23, 213, 83, 24, 212, 83, 25, 209, 83, 27, 203, 84, 32, 194, 86, 38, 185, 91, 48, 175, 98, 60, 120, 58,
				41, 166, 86, 63, 178, 83, 54, 189, 81, 48, 200, 84, 48, 200, 84, 46, 193, 82, 46, 194, 94, 60, 180, 93, 66, 170, 99, 75, 191, 132,
				115, 221, 179, 173, 202, 187, 202, 95, 109, 152, 26, 49, 100, 74, 82, 123, 183, 174, 201, 218, 189, 199, 189, 139, 133, 162, 94, 73,
				173, 87, 55, 184, 86, 44, 195, 89, 43, 201, 89, 39, 203, 89, 36, 204, 89, 35, 204, 88, 36, 204, 88, 37, 204, 88, 37, 204, 88, 39, 204,
				89, 37, 206, 89, 32, 209, 89, 28, 211, 88, 26, 213, 87, 26, 214, 87, 26, 215, 86, 28, 212, 86, 30, 206, 86, 33, 198, 88, 39, 189, 93,
				49, 177, 98, 59, 125, 63, 46, 172, 92, 69, 184, 88, 60, 192, 84, 52, 201, 86, 50, 200, 86, 49, 193, 84, 49, 195, 95, 64, 180, 95, 70,
				171, 100, 80, 194, 135, 120, 227, 185, 180, 210, 194, 211, 100, 113, 156, 33, 53, 104, 76, 81, 122, 183, 171, 197, 219, 187, 197, 191,
				138, 133, 164, 94, 74, 176, 90, 59, 195, 97, 56, 195, 90, 45, 198, 87, 39, 199, 87, 38, 199, 87, 39, 199, 87, 39, 198, 87, 41, 197,
				88, 42, 197, 87, 43, 197, 88, 42, 197, 89, 39, 198, 89, 35, 201, 88, 32, 203, 87, 32, 205, 87, 33, 207, 85, 33, 204, 84, 33, 199, 85,
				36, 191, 88, 42, 185, 94, 51, 178, 102, 64, 124, 60, 40, 166, 84, 59, 186, 89, 60, 197, 90, 56, 204, 90, 53, 205, 91, 54, 202, 93, 58,
				196, 96, 64, 181, 95, 68, 178, 105, 84, 199, 139, 123, 228, 185, 179, 213, 192, 205, 106, 109, 146, 44, 53, 97, 82, 78, 112, 187, 168,
				188, 229, 190, 196, 204, 145, 136, 172, 96, 75, 177, 87, 55, 200, 100, 58, 199, 93, 48, 200, 92, 45, 201, 92, 45, 200, 92, 46, 199,
				92, 48, 197, 92, 50, 196, 93, 51, 196, 92, 53, 194, 94, 54, 191, 96, 55, 189, 97, 55, 191, 96, 54, 194, 95, 53, 196, 94, 52, 199, 93,
				52, 197, 92, 52, 193, 92, 53, 187, 94, 57, 181, 100, 64, 174, 107, 74, 121, 62, 43, 159, 83, 61, 176, 87, 60, 184, 85, 55, 187, 83,
				51, 188, 84, 51, 186, 86, 56, 179, 88, 60, 168, 89, 67, 170, 103, 87, 191, 136, 125, 219, 179, 177, 207, 187, 200, 108, 109, 142, 40,
				46, 86, 81, 75, 105, 189, 168, 186, 226, 187, 192, 197, 139, 132, 165, 92, 73, 170, 86, 57, 186, 93, 57, 185, 88, 50, 185, 87, 48,
				185, 87, 49, 183, 87, 51, 181, 88, 53, 179, 88, 57, 178, 88, 58, 177, 89, 60, 174, 90, 61, 170, 92, 64, 166, 94, 65, 167, 94, 65, 171,
				92, 65, 174, 91, 63, 176, 90, 62, 175, 89, 61, 173, 89, 62, 169, 90, 64, 165, 96, 70, 161, 103, 79, 120, 75, 64, 165, 106, 92, 183,
				114, 96, 193, 115, 94, 197, 114, 92, 197, 113, 91, 195, 115, 95, 189, 116, 99, 180, 118, 106, 181, 130, 123, 197, 156, 154, 220, 191,
				197, 205, 193, 212, 108, 114, 150, 34, 45, 86, 79, 78, 111, 189, 175, 196, 225, 195, 205, 199, 154, 153, 177, 118, 108, 186, 118, 100,
				190, 114, 92, 191, 114, 89, 192, 114, 90, 190, 114, 92, 188, 114, 94, 186, 115, 97, 183, 116, 101, 182, 116, 103, 181, 117, 105, 179,
				117, 106, 174, 119, 108, 171, 121, 108, 171, 121, 108, 176, 120, 108, 180, 118, 107, 181, 117, 104, 181, 116, 103, 180, 116, 103, 177,
				116, 103, 175, 122, 107, 173, 128, 114, 130, 104, 104, 188, 153, 150, 215, 172, 167, 227, 177, 169, 231, 176, 167, 231, 175, 166, 229,
				175, 169, 225, 176, 173, 216, 175, 177, 211, 179, 186, 216, 193, 204, 226, 214, 230, 201, 203, 228, 97, 115, 158, 30, 52, 98, 72, 83,
				122, 179, 178, 208, 224, 209, 229, 217, 190, 200, 212, 175, 177, 224, 181, 177, 221, 170, 164, 223, 172, 164, 223, 172, 166, 221, 173,
				169, 219, 173, 172, 216, 173, 175, 214, 174, 178, 213, 174, 180, 213, 175, 181, 211, 175, 183, 208, 177, 183, 206, 179, 182, 207, 178,
				180, 211, 177, 180, 215, 175, 179, 216, 174, 176, 217, 173, 175, 217, 173, 174, 214, 173, 173, 214, 178, 176, 211, 182, 178, 128, 122,
				133, 187, 175, 184, 215, 201, 208, 222, 201, 207, 221, 195, 200, 222, 195, 201, 222, 196, 204, 221, 198, 209, 212, 196, 210, 202, 192,
				211, 197, 193, 217, 195, 199, 225, 164, 181, 212, 69, 100, 150, 26, 60, 114, 52, 77, 124, 138, 152, 192, 188, 191, 222, 202, 195, 218,
				210, 196, 213, 219, 202, 215, 220, 195, 206, 219, 194, 204, 217, 194, 206, 216, 194, 209, 213, 195, 213, 211, 195, 215, 210, 196, 217,
				209, 196, 219, 209, 196, 219, 209, 196, 219, 208, 198, 217, 208, 199, 215, 209, 198, 213, 212, 197, 211, 215, 195, 210, 218, 195, 209,
				219, 194, 208, 219, 193, 206, 217, 193, 204, 217, 198, 206, 213, 201, 207, 55, 69, 88, 76, 88, 108, 87, 96, 116, 87, 92, 110, 85, 87,
				105, 88, 88, 107, 90, 89, 111, 90, 92, 118, 85, 92, 121, 78, 88, 121, 72, 85, 123, 65, 86, 128, 52, 84, 134, 28, 74, 133, 16, 64, 127,
				13, 52, 109, 49, 80, 130, 73, 95, 138, 79, 92, 128, 79, 85, 117, 77, 79, 109, 80, 81, 110, 83, 84, 113, 82, 85, 116, 81, 85, 119, 79,
				86, 121, 77, 86, 123, 76, 87, 124, 76, 86, 125, 77, 86, 125, 79, 86, 122, 79, 87, 117, 80, 87, 112, 83, 88, 110, 86, 86, 110, 88, 85,
				109, 91, 84, 109, 91, 83, 108, 91, 82, 107, 89, 81, 104, 87, 84, 103, 86, 86, 102, 31, 55, 76, 32, 57, 79, 31, 54, 78, 37, 59, 82, 43,
				63, 87, 43, 61, 85, 43, 59, 85, 44, 60, 89, 44, 61, 95, 42, 62, 99, 40, 62, 103, 36, 63, 109, 26, 63, 116, 11, 61, 122, 25, 79, 143,
				15, 61, 119, 27, 65, 118, 36, 67, 115, 38, 62, 104, 36, 56, 93, 40, 54, 90, 56, 71, 106, 45, 62, 98, 42, 59, 99, 41, 59, 101, 39, 60,
				102, 38, 60, 104, 39, 60, 104, 39, 59, 104, 41, 59, 102, 42, 59, 100, 42, 60, 95, 43, 60, 90, 45, 60, 88, 47, 58, 90, 50, 58, 91, 51,
				57, 90, 52, 55, 89, 51, 54, 88, 49, 55, 86, 45, 54, 81, 38, 52, 74, 32, 52, 68, 38, 63, 81, 37, 64, 83, 36, 62, 82, 36, 59, 81, 35,
				56, 78, 34, 53, 76, 34, 52, 77, 34, 52, 82, 36, 53, 87, 36, 54, 92, 32, 55, 97, 23, 55, 104, 10, 56, 111, 19, 69, 126, 9, 52, 106, 23,
				59, 109, 31, 60, 104, 31, 54, 93, 31, 50, 86, 33, 51, 84, 47, 63, 97, 39, 57, 94, 37, 55, 95, 35, 56, 97, 34, 56, 98, 35, 56, 98, 36,
				56, 96, 38, 55, 95, 39, 55, 92, 40, 55, 91, 37, 56, 90, 35, 57, 89, 36, 57, 89, 38, 56, 91, 40, 56, 93, 41, 54, 92, 40, 53, 92, 39,
				53, 92, 37, 53, 90, 36, 55, 87, 36, 58, 86, 64, 76, 84, 87, 100, 110, 94, 108, 119, 95, 107, 119, 95, 105, 117, 97, 104, 117, 98, 102,
				116, 98, 102, 118, 98, 103, 123, 97, 105, 129, 95, 106, 133, 89, 106, 138, 72, 97, 138, 34, 72, 121, 23, 66, 118, 17, 53, 102, 46, 76,
				119, 65, 87, 125, 72, 87, 119, 77, 87, 116, 80, 87, 112, 81, 86, 112, 81, 86, 114, 80, 87, 115, 79, 87, 116, 78, 87, 116, 78, 87, 115,
				80, 87, 114, 82, 86, 112, 83, 86, 109, 83, 86, 108, 80, 88, 110, 77, 89, 113, 77, 89, 115, 78, 88, 117, 80, 88, 118, 80, 87, 118, 80,
				86, 118, 77, 86, 118, 75, 87, 116, 73, 88, 114, 69, 87, 110, 113, 109, 108, 161, 154, 152, 182, 169, 167, 189, 172, 170, 192, 172,
				170, 194, 170, 169, 195, 166, 167, 195, 171, 173, 192, 174, 179, 184, 175, 182, 181, 180, 190, 177, 185, 202, 148, 166, 195, 71, 100,
				144, 32, 64, 113, 29, 52, 96, 105, 119, 157, 156, 161, 191, 166, 161, 184, 165, 154, 169, 178, 161, 172, 174, 153, 163, 175, 154, 163,
				174, 155, 163, 173, 155, 162, 173, 156, 162, 172, 156, 161, 173, 156, 160, 173, 157, 157, 174, 156, 155, 174, 156, 155, 173, 157, 160,
				172, 158, 165, 171, 157, 167, 172, 156, 168, 174, 156, 168, 174, 156, 169, 173, 156, 168, 169, 156, 167, 165, 157, 165, 162, 159, 165,
				155, 158, 163, 134, 114, 105, 194, 165, 152, 220, 179, 164, 230, 180, 164, 234, 179, 162, 236, 175, 160, 233, 169, 155, 232, 176, 165,
				225, 181, 171, 215, 184, 177, 217, 201, 197, 224, 221, 223, 194, 203, 222, 96, 117, 156, 40, 62, 108, 38, 50, 90, 153, 153, 184, 227,
				214, 235, 228, 203, 215, 211, 176, 179, 231, 187, 184, 227, 178, 170, 228, 178, 168, 228, 179, 166, 227, 179, 165, 226, 180, 164, 225,
				181, 164, 225, 181, 162, 225, 182, 159, 225, 182, 157, 225, 182, 158, 225, 182, 164, 225, 182, 170, 225, 180, 172, 226, 179, 171, 228,
				180, 171, 228, 180, 171, 226, 181, 170, 222, 182, 170, 216, 182, 168, 212, 186, 171, 206, 189, 174, 112, 84, 69, 160, 117, 96, 177,
				119, 96, 185, 113, 87, 193, 110, 83, 197, 108, 82, 189, 102, 78, 188, 108, 86, 177, 113, 95, 171, 124, 109, 187, 156, 144, 208, 193,
				189, 189, 190, 203, 98, 113, 148, 42, 60, 103, 45, 51, 87, 159, 152, 178, 224, 202, 216, 210, 172, 177, 177, 127, 122, 189, 129, 116,
				186, 118, 100, 191, 120, 98, 192, 121, 95, 192, 121, 94, 191, 121, 94, 190, 122, 93, 189, 123, 91, 189, 124, 90, 189, 124, 88, 189,
				124, 89, 189, 123, 93, 189, 123, 98, 189, 121, 99, 192, 120, 98, 192, 121, 97, 192, 122, 98, 190, 123, 99, 185, 124, 99, 178, 124, 99,
				173, 129, 103, 168, 134, 109, 101, 70, 48, 141, 93, 66, 153, 90, 59, 166, 86, 54, 181, 88, 56, 188, 89, 58, 182, 83, 54, 177, 86, 59,
				162, 85, 64, 157, 97, 80, 182, 137, 123, 215, 187, 181, 199, 191, 202, 96, 109, 142, 39, 58, 98, 46, 52, 84, 163, 155, 177, 223, 198,
				208, 198, 155, 154, 155, 98, 87, 164, 95, 77, 168, 89, 66, 172, 88, 61, 174, 88, 58, 175, 88, 57, 175, 88, 57, 175, 88, 56, 174, 89,
				55, 174, 89, 55, 174, 89, 53, 175, 89, 53, 175, 90, 55, 175, 89, 57, 175, 88, 56, 177, 86, 56, 178, 87, 57, 177, 88, 59, 174, 90, 60,
				169, 90, 62, 161, 91, 63, 155, 96, 69, 151, 105, 79, 109, 73, 47, 153, 98, 68, 169, 98, 62, 181, 93, 55, 194, 93, 55, 203, 95, 58,
				200, 92, 57, 197, 94, 63, 178, 90, 64, 169, 97, 76, 192, 134, 118, 225, 184, 177, 208, 192, 201, 102, 112, 142, 39, 58, 95, 46, 53,
				82, 167, 158, 176, 229, 202, 208, 203, 158, 152, 161, 98, 82, 176, 98, 75, 188, 98, 70, 189, 93, 62, 192, 91, 57, 193, 91, 56, 194,
				90, 56, 195, 90, 56, 193, 91, 56, 193, 91, 54, 195, 90, 54, 195, 91, 53, 195, 92, 52, 195, 92, 52, 195, 90, 51, 196, 89, 51, 197, 89,
				52, 197, 90, 55, 195, 92, 58, 188, 92, 61, 178, 94, 63, 172, 100, 71, 169, 111, 83, 113, 72, 39, 160, 98, 61, 178, 99, 58, 186, 90,
				46, 195, 85, 41, 204, 87, 44, 204, 85, 46, 204, 92, 56, 189, 90, 60, 180, 95, 72, 201, 130, 112, 231, 178, 169, 214, 188, 197, 109,
				118, 147, 40, 61, 96, 45, 53, 78, 168, 158, 173, 233, 202, 205, 209, 158, 148, 166, 96, 76, 182, 96, 68, 196, 96, 62, 200, 91, 54,
				203, 89, 50, 206, 88, 50, 207, 87, 50, 208, 87, 50, 208, 87, 50, 208, 87, 49, 209, 86, 49, 209, 87, 47, 208, 89, 44, 208, 89, 42, 209,
				88, 40, 209, 87, 39, 211, 87, 43, 211, 88, 47, 208, 89, 51, 201, 89, 54, 191, 90, 57, 183, 96, 65, 177, 106, 78, 116, 71, 36, 161, 95,
				55, 179, 96, 50, 190, 90, 41, 200, 87, 37, 205, 85, 37, 202, 81, 37, 206, 89, 50, 193, 89, 57, 186, 96, 70, 209, 131, 110, 238, 179,
				168, 218, 189, 195, 107, 116, 143, 39, 61, 95, 45, 53, 77, 168, 158, 171, 233, 202, 202, 211, 157, 144, 169, 94, 71, 183, 91, 59, 193,
				87, 49, 201, 86, 45, 206, 84, 42, 209, 83, 42, 211, 82, 42, 211, 82, 42, 212, 81, 43, 212, 81, 43, 213, 81, 43, 213, 81, 40, 212, 83,
				37, 212, 85, 32, 212, 84, 29, 213, 82, 31, 215, 82, 34, 216, 82, 39, 213, 83, 43, 205, 83, 47, 195, 84, 52, 186, 89, 59, 176, 97, 70,
				120, 71, 37, 162, 94, 53, 180, 94, 47, 193, 92, 41, 203, 91, 38, 204, 87, 35, 199, 80, 33, 202, 88, 45, 191, 88, 53, 185, 94, 66, 208,
				129, 107, 238, 178, 167, 216, 188, 194, 103, 112, 139, 37, 60, 94, 46, 54, 78, 167, 157, 170, 232, 200, 199, 210, 156, 142, 170, 95,
				70, 184, 91, 56, 191, 84, 44, 201, 85, 41, 206, 84, 39, 210, 83, 39, 211, 82, 39, 212, 81, 40, 212, 81, 42, 212, 81, 42, 213, 81, 42,
				212, 81, 40, 212, 83, 36, 211, 85, 31, 211, 84, 28, 213, 82, 30, 215, 81, 33, 216, 81, 37, 214, 82, 41, 207, 82, 46, 197, 83, 52, 188,
				88, 59, 178, 95, 69, 121, 71, 40, 162, 94, 54, 180, 96, 50, 191, 94, 44, 199, 92, 40, 200, 88, 36, 194, 83, 35, 197, 91, 47, 186, 91,
				54, 180, 95, 66, 203, 129, 107, 234, 178, 167, 214, 188, 194, 101, 111, 139, 39, 62, 96, 48, 56, 80, 165, 156, 168, 227, 197, 196,
				205, 153, 139, 167, 96, 70, 184, 95, 60, 191, 90, 48, 199, 89, 43, 203, 87, 40, 206, 85, 40, 207, 84, 41, 207, 84, 43, 207, 84, 44,
				207, 84, 45, 207, 84, 46, 207, 84, 44, 206, 86, 40, 206, 88, 36, 205, 87, 34, 207, 85, 36, 210, 84, 37, 211, 83, 42, 210, 84, 46, 205,
				84, 51, 196, 85, 55, 188, 90, 64, 180, 99, 76, 118, 68, 41, 157, 93, 57, 177, 98, 56, 185, 96, 48, 190, 93, 43, 192, 92, 41, 188, 89,
				42, 189, 97, 54, 178, 96, 59, 174, 101, 73, 198, 135, 114, 230, 183, 173, 214, 193, 199, 103, 115, 143, 41, 63, 97, 49, 57, 81, 164,
				155, 168, 224, 196, 195, 200, 153, 139, 161, 97, 71, 181, 100, 66, 187, 95, 54, 190, 91, 48, 193, 89, 44, 195, 88, 44, 195, 88, 45,
				195, 88, 47, 195, 88, 49, 195, 87, 50, 195, 87, 51, 194, 88, 50, 193, 90, 47, 192, 91, 45, 193, 90, 43, 194, 88, 44, 198, 87, 46, 199,
				86, 49, 199, 85, 53, 195, 86, 57, 187, 86, 61, 182, 93, 70, 178, 104, 84, 112, 65, 44, 148, 88, 60, 173, 102, 67, 179, 101, 60, 178,
				96, 51, 180, 97, 50, 177, 98, 52, 168, 95, 55, 156, 90, 57, 160, 103, 77, 186, 139, 120, 220, 186, 177, 209, 196, 204, 104, 116, 145,
				33, 53, 87, 46, 53, 77, 164, 157, 170, 230, 205, 206, 202, 161, 150, 153, 97, 74, 172, 103, 72, 170, 92, 56, 177, 94, 54, 179, 95, 53,
				180, 94, 54, 181, 94, 55, 179, 94, 57, 178, 95, 59, 178, 94, 59, 178, 94, 61, 177, 95, 60, 176, 96, 59, 176, 97, 59, 177, 96, 58, 178,
				95, 59, 183, 92, 60, 183, 90, 60, 183, 89, 63, 180, 89, 66, 175, 90, 70, 173, 97, 79, 171, 109, 92, 106, 62, 49, 134, 81, 61, 151, 91,
				63, 161, 97, 62, 165, 99, 59, 163, 97, 56, 161, 98, 59, 155, 100, 63, 146, 97, 69, 145, 104, 83, 161, 128, 113, 182, 160, 154, 173,
				167, 176, 97, 110, 137, 47, 63, 96, 56, 63, 85, 143, 137, 149, 189, 169, 170, 168, 135, 125, 134, 89, 69, 151, 96, 69, 150, 89, 56,
				157, 92, 57, 159, 93, 58, 158, 93, 59, 158, 93, 60, 157, 93, 62, 156, 93, 64, 155, 94, 64, 155, 93, 65, 155, 93, 65, 153, 95, 65, 151,
				96, 65, 152, 95, 65, 156, 93, 65, 158, 90, 66, 160, 88, 67, 161, 87, 68, 159, 87, 70, 155, 88, 72, 150, 90, 75, 138, 89, 74,
			]
		),
	},
	{
		c: "nl",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				172, 62, 61, 191, 61, 63, 197, 59, 56, 197, 59, 56, 197, 59, 56, 197, 59, 57, 196, 58, 56, 194, 59, 56, 194, 59, 56, 194, 59, 56, 193,
				58, 55, 194, 59, 56, 195, 60, 57, 195, 60, 57, 194, 59, 56, 193, 58, 55, 193, 58, 55, 193, 58, 55, 193, 58, 55, 193, 58, 55, 192, 58,
				55, 193, 58, 55, 193, 58, 55, 195, 57, 55, 196, 57, 54, 198, 56, 54, 191, 59, 55, 191, 59, 55, 189, 60, 55, 191, 59, 55, 192, 59, 54,
				193, 58, 54, 196, 58, 55, 197, 58, 55, 191, 56, 53, 195, 60, 57, 194, 59, 56, 193, 58, 55, 194, 59, 56, 192, 57, 54, 191, 56, 53, 192,
				58, 55, 171, 61, 60, 190, 60, 62, 194, 56, 53, 194, 56, 53, 194, 56, 53, 194, 56, 54, 195, 57, 55, 193, 58, 55, 193, 58, 55, 193, 58,
				55, 193, 58, 55, 193, 58, 55, 193, 58, 55, 193, 58, 55, 192, 57, 54, 192, 57, 54, 193, 58, 55, 194, 59, 56, 193, 58, 55, 193, 58, 55,
				192, 58, 55, 193, 58, 55, 193, 58, 55, 195, 57, 55, 196, 57, 54, 198, 56, 54, 191, 59, 55, 191, 59, 55, 189, 60, 55, 191, 59, 55, 192,
				59, 54, 193, 58, 54, 195, 57, 54, 196, 57, 54, 192, 57, 54, 194, 59, 56, 193, 58, 55, 191, 56, 53, 193, 58, 55, 192, 57, 54, 191, 56,
				53, 193, 59, 56, 185, 59, 62, 213, 49, 60, 196, 57, 52, 196, 57, 54, 196, 57, 54, 196, 57, 54, 196, 57, 54, 195, 57, 54, 195, 57, 55,
				195, 57, 55, 198, 56, 54, 198, 56, 54, 198, 56, 54, 198, 56, 54, 197, 55, 53, 197, 55, 53, 198, 56, 54, 199, 57, 55, 199, 56, 58, 197,
				57, 58, 194, 58, 58, 191, 59, 57, 191, 59, 55, 193, 59, 56, 196, 58, 56, 197, 57, 56, 202, 54, 54, 200, 54, 54, 198, 56, 54, 196, 56,
				55, 195, 57, 55, 195, 57, 55, 196, 56, 55, 196, 56, 55, 198, 56, 55, 200, 58, 57, 198, 56, 55, 197, 55, 53, 199, 57, 55, 199, 57, 55,
				195, 56, 53, 197, 58, 55, 187, 61, 64, 213, 49, 60, 197, 58, 53, 196, 57, 54, 196, 57, 54, 196, 57, 54, 196, 57, 54, 195, 57, 54, 195,
				57, 55, 194, 56, 54, 197, 55, 53, 198, 56, 54, 198, 56, 54, 198, 56, 54, 198, 56, 54, 198, 56, 54, 198, 56, 54, 198, 56, 54, 198, 55,
				57, 196, 56, 57, 192, 56, 56, 190, 58, 56, 190, 58, 54, 191, 57, 54, 195, 57, 55, 196, 56, 55, 203, 55, 55, 201, 55, 55, 199, 57, 55,
				197, 57, 56, 195, 57, 55, 195, 57, 55, 196, 56, 55, 196, 56, 55, 196, 54, 53, 198, 56, 55, 196, 54, 53, 196, 54, 52, 199, 57, 55, 198,
				56, 54, 194, 55, 52, 195, 56, 53, 190, 56, 55, 197, 57, 58, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56,
				56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56,
				192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192,
				56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 192, 56,
				56, 192, 56, 56, 192, 56, 56, 192, 56, 56, 198, 64, 63, 194, 54, 55, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58,
				194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194,
				58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58,
				58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58,
				194, 58, 58, 194, 58, 58, 194, 58, 58, 194, 58, 58, 188, 66, 55, 190, 56, 47, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197,
				54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54,
				58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58,
				197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197,
				54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 197, 54, 58, 181, 59, 48, 195, 61, 52, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56,
				60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60,
				199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199,
				56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56,
				60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 199, 56, 60, 157, 83, 74, 155, 72, 66, 151, 74, 68, 151, 74, 68, 151, 74, 68,
				151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151,
				74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74,
				68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68,
				151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 151, 74, 68, 255, 194, 185, 255, 192, 186, 255, 199, 193, 255, 199,
				193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199,
				193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199,
				193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199,
				193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199, 193, 255, 199,
				193, 255, 199, 193, 255, 199, 193, 255, 251, 255, 255, 252, 255, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254,
				252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254,
				252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254,
				252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254,
				252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 254, 254, 252, 255, 250,
				254, 255, 251, 255, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255,
				253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255,
				253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255,
				253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255,
				253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 248, 255, 255, 247, 255, 255, 255, 253, 255, 255, 253,
				255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253,
				255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253,
				255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253,
				255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253,
				255, 255, 253, 255, 255, 253, 255, 239, 249, 250, 247, 255, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253,
				255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253,
				255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253,
				255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253,
				255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 255,
				248, 255, 251, 248, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255,
				255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255,
				255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255,
				255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255,
				255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 255, 255, 248, 255, 246, 243, 253, 254, 255, 253, 254,
				255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254,
				255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254,
				255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254,
				255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254,
				255, 253, 254, 255, 253, 254, 255, 234, 248, 251, 255, 253, 255, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255,
				250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255,
				250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255,
				250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255,
				250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 254, 255, 250, 245, 255,
				255, 254, 251, 255, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255,
				249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255,
				249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255,
				249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255,
				249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 253, 255, 249, 216, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255,
				255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255,
				255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255,
				255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255,
				255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255, 255, 221, 255,
				255, 221, 255, 255, 221, 255, 255, 30, 80, 105, 43, 83, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79,
				119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119,
				37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37,
				79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 37, 79,
				119, 37, 79, 119, 37, 79, 119, 37, 79, 119, 0, 92, 172, 1, 89, 163, 0, 91, 162, 0, 91, 162, 0, 91, 162, 0, 91, 162, 0, 91, 162, 0, 91,
				162, 0, 91, 162, 0, 91, 162, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 5, 88,
				164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 3, 89, 162, 3, 89, 162, 3, 89, 162, 3, 89,
				162, 3, 89, 162, 3, 89, 162, 3, 89, 162, 3, 89, 162, 5, 89, 162, 5, 89, 162, 5, 89, 162, 5, 89, 162, 5, 89, 162, 5, 89, 162, 5, 89,
				162, 5, 89, 162, 0, 92, 172, 1, 89, 163, 0, 91, 162, 0, 91, 162, 0, 91, 162, 0, 91, 162, 0, 91, 162, 0, 91, 162, 0, 91, 162, 0, 91,
				162, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 5, 88, 164, 5, 88, 164, 5, 88,
				164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 3, 89, 162, 3, 89, 162, 3, 89, 162, 3, 89, 162, 3, 89, 162, 3, 89,
				162, 3, 89, 162, 3, 89, 162, 5, 89, 162, 5, 89, 162, 5, 89, 162, 5, 89, 162, 5, 89, 162, 5, 89, 162, 5, 89, 162, 5, 89, 162, 4, 89,
				169, 8, 86, 161, 6, 87, 166, 6, 87, 166, 6, 87, 166, 6, 87, 166, 6, 87, 166, 6, 87, 166, 6, 87, 166, 6, 87, 166, 0, 90, 168, 0, 90,
				168, 0, 90, 168, 0, 90, 168, 0, 90, 168, 0, 90, 168, 0, 90, 168, 0, 90, 168, 2, 89, 168, 2, 89, 168, 2, 89, 168, 2, 89, 168, 2, 89,
				168, 2, 89, 168, 2, 89, 168, 2, 89, 168, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89,
				166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 5, 90, 170, 8, 86, 161, 6, 87,
				166, 6, 87, 166, 6, 87, 166, 6, 87, 166, 6, 87, 166, 6, 87, 166, 6, 87, 166, 6, 87, 166, 0, 90, 168, 0, 90, 168, 0, 90, 168, 0, 90,
				168, 0, 90, 168, 0, 90, 168, 0, 90, 168, 0, 90, 168, 2, 89, 168, 2, 89, 168, 2, 89, 168, 2, 89, 168, 2, 89, 168, 2, 89, 168, 2, 89,
				168, 2, 89, 168, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89,
				166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 2, 89, 166, 8, 91, 161, 2, 89, 158, 3, 89, 162, 3, 89, 162, 3, 89,
				162, 3, 89, 162, 3, 89, 162, 3, 89, 162, 3, 89, 162, 3, 89, 162, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89,
				164, 3, 89, 164, 3, 89, 164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 3, 89,
				164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89,
				164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 8, 91, 161, 2, 89, 158, 3, 89, 162, 3, 89, 162, 3, 89, 162, 3, 89, 162, 3, 89,
				162, 3, 89, 162, 3, 89, 162, 3, 89, 162, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89,
				164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 5, 88, 164, 3, 89, 164, 3, 89, 164, 3, 89,
				164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89, 164, 3, 89,
				164, 3, 89, 164, 3, 89, 164, 8, 89, 170, 0, 87, 179, 3, 90, 161, 3, 90, 161, 3, 90, 161, 3, 90, 161, 3, 90, 161, 3, 90, 161, 3, 90,
				161, 3, 90, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88,
				161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88,
				161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88,
				161, 8, 89, 170, 0, 87, 179, 3, 90, 161, 3, 90, 161, 3, 90, 161, 3, 90, 161, 3, 90, 161, 3, 90, 161, 3, 90, 161, 3, 90, 161, 6, 88,
				161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88,
				161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88,
				161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161, 6, 88, 161,
			]
		),
	},
	{
		c: "pl",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				181, 195, 187, 199, 213, 204, 199, 214, 204, 198, 211, 202, 200, 213, 204, 200, 213, 204, 201, 214, 206, 203, 214, 206, 203, 214, 206,
				202, 213, 205, 202, 213, 205, 202, 213, 205, 203, 214, 206, 204, 215, 207, 203, 216, 207, 198, 214, 205, 197, 215, 206, 199, 215, 206,
				196, 215, 205, 195, 214, 202, 195, 213, 202, 196, 214, 201, 197, 215, 201, 194, 213, 198, 192, 212, 196, 191, 212, 195, 192, 213, 196,
				195, 216, 198, 197, 219, 200, 198, 220, 201, 197, 219, 199, 198, 219, 199, 202, 220, 201, 198, 215, 196, 201, 216, 199, 206, 218, 203,
				205, 217, 201, 205, 214, 199, 204, 211, 198, 204, 209, 194, 208, 210, 194, 160, 158, 141, 227, 229, 228, 253, 253, 253, 252, 250, 250,
				254, 251, 252, 254, 253, 254, 253, 251, 253, 253, 251, 253, 254, 251, 254, 255, 252, 255, 255, 252, 255, 254, 251, 254, 254, 251, 254,
				254, 251, 254, 255, 251, 254, 254, 252, 254, 252, 253, 255, 250, 253, 255, 251, 253, 255, 250, 253, 255, 250, 253, 253, 250, 253, 253,
				249, 253, 252, 249, 253, 251, 250, 254, 251, 250, 254, 251, 248, 254, 249, 248, 254, 247, 248, 254, 247, 249, 254, 248, 248, 254, 247,
				247, 254, 245, 246, 254, 246, 247, 254, 247, 244, 253, 246, 250, 255, 251, 252, 254, 252, 251, 251, 250, 252, 251, 250, 253, 252, 251,
				252, 251, 249, 252, 250, 246, 188, 182, 176, 227, 228, 226, 255, 252, 252, 252, 245, 247, 254, 246, 251, 255, 250, 254, 253, 248, 253,
				252, 248, 253, 253, 249, 253, 254, 249, 254, 255, 249, 255, 255, 249, 255, 255, 249, 255, 255, 249, 254, 255, 250, 254, 255, 251, 254,
				253, 252, 255, 252, 251, 255, 252, 251, 255, 252, 251, 255, 252, 252, 254, 252, 252, 254, 251, 252, 253, 251, 251, 252, 253, 253, 253,
				252, 254, 254, 251, 253, 252, 251, 252, 251, 251, 253, 251, 251, 253, 251, 251, 253, 251, 251, 253, 250, 249, 253, 249, 246, 254, 249,
				244, 254, 249, 249, 255, 253, 252, 254, 253, 252, 248, 251, 252, 246, 251, 253, 248, 252, 249, 246, 248, 248, 247, 246, 182, 179, 176,
				223, 229, 222, 255, 255, 251, 255, 250, 251, 255, 250, 253, 255, 250, 254, 255, 252, 255, 253, 254, 255, 252, 254, 255, 254, 253, 255,
				255, 252, 255, 255, 250, 255, 255, 250, 254, 255, 251, 254, 255, 253, 254, 254, 254, 254, 253, 254, 255, 253, 254, 255, 253, 254, 255,
				253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 252, 255, 255, 252, 254, 255, 252, 254, 255,
				252, 255, 255, 253, 254, 255, 252, 255, 255, 252, 254, 255, 249, 255, 253, 244, 255, 248, 243, 255, 249, 245, 255, 250, 250, 255, 251,
				254, 251, 254, 255, 249, 255, 255, 250, 254, 249, 248, 250, 249, 252, 251, 179, 183, 179, 222, 231, 223, 254, 255, 251, 255, 252, 252,
				255, 251, 254, 254, 252, 255, 254, 254, 255, 251, 255, 255, 249, 255, 255, 251, 255, 255, 254, 253, 255, 255, 252, 255, 255, 252, 254,
				255, 252, 254, 254, 254, 254, 253, 255, 253, 253, 255, 253, 253, 255, 253, 253, 254, 254, 253, 255, 253, 253, 254, 254, 253, 255, 253,
				253, 254, 254, 253, 255, 253, 253, 254, 254, 253, 255, 253, 253, 255, 253, 253, 255, 253, 253, 255, 253, 253, 254, 254, 253, 255, 253,
				253, 254, 253, 250, 255, 251, 246, 255, 249, 246, 255, 249, 245, 255, 249, 251, 255, 250, 254, 250, 254, 255, 248, 255, 255, 250, 254,
				247, 249, 251, 246, 252, 253, 174, 184, 180, 220, 229, 222, 252, 255, 251, 253, 253, 251, 255, 253, 254, 252, 253, 255, 251, 255, 255,
				249, 255, 255, 247, 255, 255, 249, 255, 255, 251, 255, 255, 253, 254, 255, 254, 254, 255, 253, 254, 254, 252, 255, 253, 252, 255, 252,
				254, 255, 250, 254, 255, 249, 254, 255, 250, 254, 255, 249, 254, 255, 250, 254, 255, 249, 254, 255, 250, 254, 255, 249, 254, 255, 249,
				254, 255, 249, 254, 255, 249, 254, 255, 249, 254, 255, 249, 254, 255, 249, 254, 255, 249, 254, 255, 250, 254, 255, 249, 252, 254, 249,
				252, 255, 250, 251, 255, 250, 253, 253, 251, 255, 250, 254, 255, 249, 255, 253, 250, 255, 245, 250, 251, 243, 253, 253, 172, 185, 180,
				221, 227, 221, 251, 255, 252, 251, 253, 252, 253, 255, 254, 250, 253, 254, 250, 255, 255, 249, 255, 255, 248, 255, 255, 249, 255, 255,
				251, 255, 255, 251, 255, 255, 252, 255, 255, 252, 254, 255, 252, 255, 254, 254, 255, 252, 255, 254, 249, 255, 255, 247, 255, 254, 249,
				255, 255, 247, 255, 254, 249, 255, 255, 247, 255, 254, 249, 255, 255, 248, 255, 254, 248, 255, 254, 248, 255, 254, 248, 255, 254, 248,
				255, 254, 248, 255, 254, 248, 255, 255, 248, 255, 254, 249, 255, 253, 249, 255, 252, 250, 255, 252, 252, 253, 253, 251, 254, 252, 253,
				255, 249, 255, 255, 250, 255, 252, 250, 255, 244, 249, 252, 244, 252, 253, 172, 186, 182, 226, 226, 224, 254, 255, 255, 251, 255, 254,
				252, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 252, 255, 255,
				253, 254, 255, 254, 254, 255, 255, 253, 253, 255, 253, 250, 255, 254, 249, 255, 253, 250, 255, 254, 249, 255, 253, 250, 255, 254, 249,
				255, 253, 250, 255, 254, 249, 255, 253, 250, 255, 254, 250, 255, 253, 250, 255, 253, 250, 255, 254, 250, 255, 253, 250, 255, 254, 249,
				255, 253, 250, 255, 252, 250, 255, 249, 252, 255, 250, 254, 255, 252, 253, 255, 250, 254, 255, 249, 255, 255, 250, 255, 252, 250, 255,
				245, 248, 252, 246, 252, 253, 175, 185, 183, 225, 223, 224, 253, 255, 254, 249, 255, 253, 249, 255, 255, 248, 255, 255, 250, 255, 255,
				252, 254, 255, 254, 254, 255, 252, 255, 255, 250, 255, 255, 250, 255, 255, 250, 255, 255, 252, 254, 254, 255, 253, 255, 255, 253, 254,
				255, 253, 254, 255, 254, 252, 255, 253, 254, 255, 254, 252, 255, 253, 254, 255, 254, 252, 255, 253, 253, 255, 254, 252, 255, 253, 253,
				255, 254, 253, 255, 253, 253, 255, 253, 253, 255, 254, 253, 255, 253, 253, 255, 254, 252, 255, 253, 254, 255, 252, 254, 255, 250, 254,
				255, 250, 254, 254, 252, 255, 251, 252, 254, 253, 251, 255, 253, 252, 255, 251, 251, 255, 245, 249, 250, 246, 252, 252, 175, 183, 182,
				222, 222, 220, 249, 254, 250, 245, 255, 250, 247, 255, 255, 246, 255, 253, 247, 255, 253, 252, 254, 254, 254, 254, 254, 252, 255, 255,
				249, 255, 255, 248, 255, 254, 248, 255, 253, 251, 254, 253, 255, 253, 254, 254, 253, 254, 251, 255, 255, 249, 255, 255, 249, 255, 255,
				249, 255, 255, 249, 255, 255, 249, 255, 255, 249, 255, 255, 249, 255, 255, 249, 255, 255, 249, 255, 255, 249, 255, 255, 249, 255, 255,
				249, 255, 255, 249, 255, 255, 249, 255, 255, 249, 255, 255, 252, 255, 255, 255, 254, 255, 254, 254, 254, 247, 255, 253, 242, 255, 251,
				244, 255, 254, 246, 255, 255, 245, 253, 253, 243, 250, 249, 247, 252, 252, 177, 183, 181, 223, 225, 220, 251, 254, 249, 248, 255, 250,
				248, 255, 251, 248, 255, 253, 250, 255, 253, 254, 254, 253, 255, 253, 252, 255, 253, 252, 252, 255, 252, 249, 255, 252, 249, 255, 250,
				252, 254, 250, 255, 253, 251, 254, 253, 253, 251, 255, 255, 248, 255, 255, 248, 255, 255, 248, 255, 255, 248, 255, 255, 248, 255, 255,
				248, 255, 255, 248, 255, 255, 248, 255, 255, 248, 255, 255, 248, 255, 255, 248, 255, 255, 248, 255, 255, 248, 255, 255, 248, 255, 255,
				248, 255, 255, 251, 255, 255, 255, 255, 255, 254, 255, 253, 245, 255, 251, 241, 255, 249, 241, 255, 252, 244, 255, 253, 246, 253, 251,
				245, 249, 248, 250, 252, 250, 180, 183, 179, 220, 222, 214, 254, 255, 248, 251, 253, 246, 251, 255, 247, 250, 254, 247, 253, 255, 249,
				255, 251, 247, 255, 249, 247, 255, 250, 247, 255, 252, 247, 252, 253, 246, 251, 254, 246, 253, 252, 246, 255, 250, 247, 255, 250, 249,
				254, 252, 253, 251, 253, 254, 251, 253, 254, 251, 253, 254, 251, 253, 254, 251, 253, 254, 251, 253, 254, 251, 253, 254, 251, 253, 254,
				251, 253, 254, 251, 253, 254, 251, 253, 254, 251, 253, 254, 251, 253, 254, 251, 253, 254, 251, 252, 254, 253, 252, 252, 255, 253, 250,
				253, 253, 248, 248, 255, 248, 245, 255, 248, 244, 255, 249, 247, 255, 248, 250, 252, 247, 252, 248, 244, 254, 251, 248, 182, 184, 178,
				238, 231, 223, 255, 251, 244, 254, 249, 243, 254, 250, 243, 254, 251, 243, 255, 246, 240, 255, 245, 241, 255, 245, 242, 255, 246, 243,
				255, 247, 244, 254, 250, 244, 254, 251, 244, 254, 249, 244, 255, 246, 244, 255, 245, 246, 255, 247, 249, 254, 248, 250, 254, 248, 250,
				254, 248, 250, 254, 248, 250, 254, 248, 250, 254, 248, 250, 254, 248, 250, 254, 248, 250, 254, 248, 250, 254, 248, 250, 254, 248, 250,
				254, 248, 250, 254, 248, 250, 254, 248, 250, 254, 248, 250, 255, 247, 249, 255, 247, 247, 254, 248, 245, 253, 250, 245, 253, 252, 245,
				252, 252, 245, 253, 252, 245, 254, 247, 243, 255, 244, 242, 255, 247, 244, 186, 180, 174, 224, 194, 188, 245, 202, 201, 246, 197, 197,
				248, 198, 199, 250, 204, 203, 248, 199, 198, 252, 197, 199, 255, 196, 200, 254, 197, 200, 252, 198, 200, 249, 200, 201, 247, 202, 201,
				249, 200, 201, 253, 197, 201, 254, 197, 201, 254, 197, 202, 253, 198, 202, 253, 198, 202, 253, 198, 202, 253, 198, 202, 253, 198, 202,
				253, 198, 202, 253, 198, 202, 253, 198, 202, 253, 198, 202, 253, 198, 202, 253, 198, 202, 253, 198, 202, 253, 198, 202, 253, 198, 202,
				253, 198, 202, 253, 198, 202, 254, 198, 203, 254, 199, 202, 251, 199, 201, 250, 202, 202, 249, 203, 203, 249, 202, 202, 251, 198, 201,
				251, 195, 200, 248, 201, 202, 184, 151, 148, 155, 97, 95, 185, 100, 105, 190, 92, 102, 191, 91, 100, 191, 97, 103, 189, 96, 100, 193,
				91, 99, 197, 89, 98, 197, 89, 98, 194, 90, 98, 189, 92, 99, 186, 94, 100, 189, 92, 100, 195, 90, 100, 197, 89, 98, 196, 89, 98, 196,
				90, 97, 196, 90, 97, 196, 90, 97, 196, 90, 97, 196, 90, 97, 196, 90, 97, 196, 90, 97, 196, 90, 97, 196, 90, 97, 196, 90, 97, 196, 90,
				97, 196, 90, 97, 196, 90, 97, 196, 90, 97, 196, 90, 97, 196, 90, 98, 197, 90, 100, 196, 90, 100, 194, 90, 100, 192, 91, 100, 190, 94,
				101, 190, 93, 101, 193, 89, 101, 191, 88, 100, 188, 101, 108, 149, 88, 88, 115, 32, 32, 152, 31, 43, 165, 25, 42, 167, 22, 39, 161,
				25, 38, 158, 23, 35, 165, 23, 36, 169, 22, 37, 170, 21, 38, 169, 22, 38, 164, 24, 39, 160, 26, 40, 162, 25, 40, 168, 23, 40, 170, 22,
				38, 170, 22, 36, 169, 23, 34, 170, 22, 34, 169, 23, 34, 170, 22, 34, 169, 23, 34, 170, 22, 34, 169, 23, 34, 170, 23, 34, 170, 23, 34,
				170, 23, 34, 170, 23, 34, 170, 23, 34, 170, 23, 34, 169, 23, 34, 170, 22, 35, 169, 22, 36, 170, 23, 38, 169, 22, 39, 169, 21, 39, 167,
				23, 39, 165, 25, 39, 165, 25, 40, 168, 22, 40, 163, 22, 40, 151, 31, 43, 124, 38, 41, 130, 28, 29, 168, 19, 34, 185, 11, 34, 193, 12,
				36, 184, 14, 33, 179, 12, 29, 184, 12, 29, 189, 10, 30, 190, 9, 31, 190, 10, 32, 185, 12, 33, 182, 14, 34, 183, 13, 34, 187, 11, 33,
				189, 10, 31, 188, 11, 29, 188, 12, 27, 188, 11, 28, 188, 12, 27, 188, 11, 28, 188, 11, 27, 188, 11, 28, 188, 11, 27, 188, 11, 28, 188,
				11, 27, 188, 11, 28, 188, 11, 28, 188, 11, 27, 188, 11, 28, 188, 11, 27, 188, 11, 28, 187, 11, 29, 186, 12, 30, 187, 12, 31, 187, 10,
				31, 188, 10, 31, 186, 12, 32, 186, 13, 32, 189, 10, 33, 182, 11, 33, 163, 19, 34, 132, 30, 33, 147, 39, 38, 181, 17, 33, 195, 6, 27,
				207, 8, 32, 197, 10, 28, 191, 9, 26, 194, 6, 24, 198, 5, 24, 201, 4, 24, 200, 4, 25, 196, 5, 26, 192, 7, 27, 193, 6, 27, 196, 5, 27,
				197, 4, 26, 195, 5, 25, 195, 5, 24, 195, 5, 26, 195, 5, 24, 195, 5, 26, 195, 5, 24, 195, 5, 26, 195, 5, 25, 195, 5, 25, 195, 5, 25,
				195, 5, 25, 195, 5, 25, 195, 5, 25, 195, 5, 25, 195, 5, 25, 195, 5, 26, 193, 7, 25, 191, 9, 24, 191, 7, 23, 194, 4, 24, 196, 4, 25,
				195, 6, 26, 195, 7, 26, 198, 4, 28, 191, 6, 28, 173, 19, 33, 137, 30, 31, 143, 34, 31, 182, 15, 29, 194, 1, 20, 204, 1, 22, 190, 0,
				13, 190, 3, 16, 195, 1, 17, 198, 0, 17, 201, 0, 17, 200, 0, 18, 197, 1, 18, 193, 1, 19, 194, 1, 20, 197, 0, 21, 197, 0, 22, 194, 0,
				22, 193, 0, 22, 194, 0, 24, 193, 0, 22, 194, 0, 24, 193, 0, 23, 194, 0, 23, 193, 0, 23, 193, 0, 23, 193, 0, 23, 193, 0, 23, 193, 0,
				23, 193, 0, 23, 193, 0, 23, 193, 0, 23, 193, 1, 23, 190, 3, 21, 187, 6, 18, 188, 5, 16, 193, 0, 16, 195, 0, 16, 194, 2, 18, 194, 2,
				19, 198, 1, 21, 191, 3, 23, 170, 15, 26, 130, 26, 22, 137, 26, 25, 186, 17, 33, 200, 2, 26, 208, 2, 26, 193, 1, 16, 197, 7, 22, 197,
				3, 20, 199, 1, 18, 199, 1, 18, 198, 1, 18, 196, 2, 19, 196, 1, 20, 199, 0, 21, 202, 0, 22, 202, 0, 24, 198, 0, 25, 196, 1, 24, 198, 1,
				24, 196, 1, 24, 198, 1, 24, 196, 1, 24, 197, 1, 24, 196, 1, 24, 197, 1, 24, 196, 1, 24, 197, 1, 24, 197, 1, 24, 196, 1, 24, 197, 1,
				24, 196, 1, 24, 197, 1, 24, 194, 2, 22, 190, 6, 19, 191, 5, 16, 199, 1, 16, 200, 0, 16, 196, 2, 17, 197, 2, 18, 202, 1, 21, 195, 3,
				22, 174, 17, 27, 135, 30, 26, 145, 31, 33, 183, 15, 33, 192, 1, 25, 199, 1, 24, 194, 3, 21, 191, 4, 19, 194, 2, 18, 196, 1, 18, 193,
				2, 18, 190, 4, 18, 191, 3, 19, 195, 1, 21, 200, 0, 23, 205, 0, 24, 205, 0, 24, 201, 0, 23, 199, 0, 22, 200, 0, 22, 199, 0, 22, 200, 0,
				22, 199, 0, 22, 200, 0, 22, 199, 0, 22, 199, 0, 22, 199, 0, 21, 199, 0, 21, 199, 0, 21, 199, 0, 21, 199, 0, 21, 198, 0, 21, 199, 0,
				21, 196, 1, 21, 192, 3, 19, 194, 2, 18, 206, 0, 18, 205, 0, 17, 198, 0, 17, 196, 0, 16, 202, 0, 19, 197, 2, 22, 176, 15, 27, 135, 27,
				24, 144, 29, 31, 182, 15, 33, 189, 2, 25, 197, 2, 24, 195, 3, 22, 194, 2, 19, 197, 0, 18, 198, 1, 18, 194, 3, 18, 190, 4, 18, 192, 3,
				19, 196, 1, 21, 201, 0, 23, 207, 0, 24, 207, 0, 24, 203, 0, 22, 200, 0, 21, 200, 0, 22, 200, 0, 21, 200, 0, 22, 200, 0, 21, 200, 0,
				22, 200, 0, 21, 200, 0, 22, 201, 0, 21, 201, 0, 22, 201, 0, 22, 201, 0, 21, 201, 0, 22, 201, 0, 21, 200, 0, 22, 197, 1, 21, 194, 3,
				21, 198, 3, 20, 208, 0, 20, 208, 0, 18, 199, 0, 18, 197, 0, 18, 202, 0, 20, 198, 2, 23, 178, 14, 28, 136, 26, 25, 144, 29, 31, 181,
				16, 32, 190, 3, 24, 199, 1, 24, 199, 2, 22, 199, 0, 20, 204, 0, 19, 205, 0, 18, 200, 1, 18, 196, 3, 19, 195, 2, 20, 198, 1, 22, 202,
				0, 23, 206, 0, 23, 204, 0, 22, 199, 0, 20, 197, 0, 18, 197, 0, 20, 197, 0, 18, 197, 0, 20, 197, 0, 18, 197, 0, 19, 197, 0, 19, 198, 1,
				20, 198, 1, 20, 198, 1, 20, 198, 1, 20, 198, 1, 20, 198, 1, 20, 198, 1, 20, 198, 1, 21, 196, 1, 21, 193, 2, 20, 197, 1, 21, 207, 0,
				21, 207, 0, 18, 197, 0, 19, 195, 0, 19, 200, 0, 20, 195, 2, 22, 176, 14, 28, 138, 26, 26, 142, 32, 30, 178, 17, 32, 188, 4, 24, 199,
				3, 23, 200, 1, 22, 201, 0, 20, 207, 0, 19, 208, 0, 19, 202, 1, 19, 197, 3, 20, 195, 4, 21, 197, 3, 22, 200, 1, 23, 203, 0, 24, 201, 0,
				23, 197, 0, 20, 196, 1, 18, 196, 1, 18, 196, 1, 18, 196, 1, 18, 196, 1, 18, 196, 1, 18, 196, 1, 18, 197, 2, 19, 197, 2, 19, 197, 2,
				19, 197, 2, 19, 197, 2, 19, 197, 2, 19, 197, 2, 19, 197, 2, 20, 194, 2, 21, 191, 3, 20, 195, 2, 21, 204, 0, 23, 203, 0, 20, 194, 0,
				21, 190, 1, 21, 196, 0, 22, 192, 4, 25, 173, 16, 30, 135, 27, 28, 140, 33, 30, 174, 19, 32, 183, 6, 24, 194, 4, 22, 197, 1, 21, 199,
				0, 19, 204, 0, 19, 205, 0, 19, 199, 1, 19, 193, 4, 19, 191, 4, 20, 192, 4, 22, 193, 3, 24, 195, 2, 24, 195, 2, 23, 196, 3, 22, 196, 3,
				22, 196, 3, 22, 196, 3, 22, 196, 3, 22, 196, 3, 22, 196, 3, 22, 196, 3, 22, 196, 3, 22, 196, 3, 22, 196, 3, 22, 196, 3, 22, 196, 3,
				22, 196, 3, 22, 196, 3, 22, 196, 3, 22, 194, 4, 22, 189, 6, 24, 192, 7, 25, 200, 2, 27, 199, 1, 24, 190, 4, 25, 187, 6, 25, 191, 4,
				27, 187, 7, 29, 168, 20, 33, 133, 29, 30, 134, 34, 31, 167, 21, 32, 175, 9, 25, 185, 8, 26, 188, 5, 23, 191, 3, 20, 195, 1, 20, 196,
				1, 20, 190, 3, 20, 184, 6, 21, 181, 8, 23, 182, 7, 24, 183, 6, 25, 183, 6, 26, 185, 5, 25, 189, 5, 24, 189, 5, 23, 191, 5, 23, 189, 5,
				23, 190, 5, 23, 189, 5, 23, 190, 5, 23, 189, 5, 23, 189, 4, 22, 189, 4, 22, 189, 4, 22, 189, 4, 22, 189, 4, 22, 189, 4, 22, 188, 4,
				22, 189, 4, 22, 186, 5, 24, 185, 7, 27, 186, 6, 27, 193, 2, 27, 192, 3, 27, 184, 5, 26, 180, 7, 26, 183, 6, 27, 178, 10, 30, 161, 23,
				34, 128, 31, 32, 130, 35, 35, 159, 26, 36, 165, 16, 29, 174, 16, 30, 177, 14, 29, 181, 12, 29, 183, 9, 27, 182, 9, 27, 177, 12, 27,
				171, 14, 27, 170, 15, 28, 171, 14, 28, 172, 14, 29, 172, 13, 30, 174, 12, 30, 176, 10, 27, 178, 10, 27, 179, 9, 27, 178, 10, 27, 179,
				9, 27, 178, 10, 27, 179, 9, 27, 178, 10, 27, 179, 9, 27, 178, 10, 27, 178, 9, 27, 178, 9, 27, 178, 10, 27, 178, 9, 27, 178, 10, 27,
				179, 9, 27, 178, 9, 28, 179, 9, 30, 183, 7, 30, 188, 5, 29, 186, 6, 28, 178, 8, 28, 173, 10, 29, 174, 10, 31, 168, 15, 33, 153, 27,
				37, 121, 35, 34, 116, 43, 38, 140, 38, 41, 143, 31, 36, 150, 32, 39, 154, 30, 37, 156, 29, 37, 157, 26, 35, 156, 25, 34, 151, 28, 34,
				147, 30, 34, 146, 30, 35, 148, 29, 36, 148, 29, 36, 148, 29, 36, 150, 28, 36, 152, 27, 36, 153, 26, 34, 154, 26, 36, 153, 26, 34, 154,
				26, 36, 153, 26, 34, 154, 26, 35, 153, 26, 35, 154, 26, 36, 154, 27, 36, 154, 27, 36, 154, 27, 36, 154, 27, 36, 154, 26, 36, 154, 27,
				35, 154, 26, 37, 154, 26, 37, 156, 25, 36, 160, 24, 37, 164, 22, 35, 161, 22, 34, 155, 24, 35, 151, 25, 35, 152, 26, 37, 148, 30, 39,
				133, 38, 41, 105, 43, 36,
			]
		),
	},
	{
		c: "ru",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				255, 255, 222, 254, 252, 229, 254, 251, 242, 252, 251, 247, 252, 251, 247, 252, 251, 247, 252, 251, 247, 252, 251, 247, 252, 251, 247,
				252, 251, 246, 251, 250, 245, 251, 250, 245, 251, 250, 245, 251, 250, 245, 251, 250, 245, 251, 251, 243, 251, 250, 245, 251, 251, 243,
				253, 253, 245, 253, 253, 245, 253, 253, 245, 253, 253, 245, 253, 253, 245, 253, 253, 245, 253, 253, 245, 253, 252, 247, 252, 251, 246,
				252, 251, 246, 252, 251, 246, 252, 251, 246, 252, 251, 246, 252, 251, 246, 252, 251, 247, 252, 251, 246, 252, 252, 244, 254, 251, 242,
				254, 252, 239, 254, 253, 235, 253, 252, 232, 253, 252, 234, 254, 250, 239, 254, 252, 231, 255, 255, 228, 255, 255, 239, 254, 254, 254,
				253, 253, 255, 254, 252, 255, 253, 253, 255, 254, 252, 255, 253, 253, 255, 254, 253, 255, 253, 254, 255, 255, 254, 255, 254, 255, 255,
				255, 254, 255, 254, 255, 255, 255, 254, 255, 254, 255, 255, 255, 254, 255, 254, 255, 255, 253, 252, 255, 252, 253, 255, 253, 252, 255,
				252, 253, 255, 253, 252, 255, 252, 253, 255, 253, 252, 255, 252, 253, 255, 254, 253, 255, 253, 254, 255, 254, 253, 255, 253, 254, 255,
				254, 253, 255, 253, 254, 255, 254, 253, 255, 254, 253, 255, 254, 254, 255, 255, 253, 254, 255, 254, 250, 255, 253, 246, 255, 253, 244,
				255, 253, 244, 255, 252, 249, 255, 254, 239, 255, 255, 230, 254, 255, 237, 254, 255, 251, 252, 255, 255, 254, 255, 255, 252, 255, 255,
				254, 255, 255, 252, 255, 255, 254, 255, 255, 252, 255, 255, 254, 255, 255, 252, 255, 255, 254, 255, 255, 252, 255, 255, 254, 255, 255,
				252, 255, 253, 254, 255, 255, 252, 255, 253, 253, 255, 254, 251, 255, 252, 253, 255, 254, 251, 255, 252, 253, 255, 254, 251, 255, 252,
				253, 255, 254, 251, 255, 254, 254, 255, 255, 252, 255, 255, 254, 255, 255, 252, 255, 255, 254, 255, 255, 252, 255, 255, 254, 255, 255,
				254, 255, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 255, 253, 255, 254, 253, 255, 253, 255, 255, 255, 244,
				255, 255, 231, 250, 251, 235, 254, 255, 250, 252, 255, 255, 252, 255, 255, 252, 255, 255, 252, 255, 255, 252, 255, 255, 252, 255, 253,
				252, 255, 253, 250, 255, 251, 250, 255, 251, 250, 255, 251, 250, 255, 251, 250, 255, 249, 250, 255, 249, 250, 255, 249, 250, 255, 249,
				252, 255, 251, 252, 255, 251, 252, 255, 251, 252, 255, 251, 252, 255, 251, 252, 255, 251, 252, 255, 251, 252, 255, 251, 252, 255, 253,
				252, 255, 253, 252, 255, 253, 252, 255, 253, 252, 255, 253, 252, 255, 253, 252, 255, 253, 254, 255, 255, 254, 254, 255, 255, 254, 255,
				255, 254, 255, 255, 254, 255, 255, 253, 254, 255, 253, 254, 255, 252, 255, 255, 254, 245, 255, 255, 236, 254, 255, 241, 255, 255, 251,
				254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 253, 254, 255, 253,
				254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 251, 254, 255, 251, 254, 255, 251,
				254, 255, 251, 254, 255, 251, 254, 255, 251, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253,
				254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 253, 254, 255, 254, 254, 255, 255, 253, 254,
				255, 253, 254, 255, 252, 255, 255, 254, 243, 255, 255, 236, 253, 253, 241, 255, 255, 251, 254, 255, 255, 255, 255, 255, 254, 255, 255,
				255, 255, 255, 254, 255, 255, 255, 255, 255, 254, 255, 255, 255, 255, 253, 254, 255, 253, 255, 255, 253, 254, 255, 253, 255, 255, 253,
				254, 255, 253, 255, 255, 253, 254, 255, 253, 255, 255, 251, 254, 255, 251, 255, 255, 251, 254, 255, 251, 255, 255, 251, 254, 255, 251,
				255, 255, 253, 254, 255, 253, 255, 255, 253, 254, 255, 253, 255, 255, 253, 254, 255, 253, 255, 255, 255, 254, 255, 255, 255, 255, 255,
				254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 253, 254, 254, 252, 255, 254, 252, 255, 252, 255, 255, 255, 243,
				254, 255, 235, 251, 251, 241, 255, 255, 253, 255, 255, 255, 255, 254, 255, 255, 255, 255, 255, 254, 255, 255, 255, 255, 255, 254, 255,
				255, 255, 255, 255, 253, 254, 254, 254, 254, 255, 253, 254, 254, 254, 254, 255, 254, 252, 254, 254, 252, 255, 254, 252, 254, 254, 252,
				255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 254, 255,
				255, 255, 255, 255, 254, 255, 255, 255, 255, 255, 254, 255, 255, 255, 255, 255, 254, 255, 255, 255, 253, 254, 255, 251, 252, 255, 250,
				253, 255, 249, 253, 255, 249, 254, 255, 249, 255, 254, 250, 255, 253, 254, 255, 255, 242, 254, 255, 246, 251, 255, 255, 251, 255, 255,
				253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 254, 255, 255, 254, 255, 255,
				254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255,
				254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 254, 255, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255, 253, 254, 255,
				253, 254, 255, 253, 254, 255, 253, 254, 255, 251, 255, 255, 249, 255, 255, 249, 255, 253, 247, 255, 251, 247, 255, 251, 247, 255, 251,
				249, 255, 255, 252, 253, 255, 253, 253, 243, 244, 255, 255, 226, 243, 255, 237, 249, 255, 240, 249, 255, 240, 249, 255, 240, 249, 255,
				240, 249, 255, 240, 249, 255, 241, 250, 255, 241, 250, 255, 242, 251, 255, 242, 251, 255, 242, 251, 255, 242, 251, 255, 242, 251, 255,
				242, 251, 255, 242, 251, 255, 242, 251, 255, 241, 251, 255, 241, 251, 255, 241, 251, 255, 241, 251, 255, 241, 251, 255, 241, 251, 255,
				241, 251, 255, 241, 251, 255, 241, 251, 255, 241, 251, 255, 241, 251, 255, 241, 251, 255, 241, 251, 255, 241, 251, 255, 241, 251, 255,
				241, 251, 255, 240, 249, 255, 232, 244, 255, 236, 251, 255, 239, 255, 255, 233, 252, 255, 231, 247, 255, 241, 249, 255, 250, 254, 255,
				142, 165, 179, 133, 167, 205, 130, 161, 192, 131, 161, 189, 132, 159, 188, 130, 160, 188, 132, 159, 188, 131, 161, 189, 133, 160, 189,
				131, 161, 189, 132, 159, 188, 130, 160, 188, 132, 159, 188, 130, 160, 188, 132, 159, 188, 130, 160, 188, 132, 159, 188, 130, 160, 188,
				130, 159, 189, 129, 160, 189, 130, 159, 191, 129, 160, 189, 130, 159, 191, 129, 160, 189, 130, 159, 191, 129, 160, 189, 130, 159, 191,
				129, 160, 189, 130, 159, 191, 129, 160, 189, 130, 159, 191, 129, 160, 189, 130, 159, 191, 130, 159, 191, 134, 160, 197, 128, 157, 191,
				128, 162, 187, 130, 167, 186, 124, 162, 185, 125, 158, 189, 135, 159, 197, 143, 159, 175, 25, 66, 86, 11, 68, 121, 16, 77, 134, 15,
				77, 138, 15, 75, 137, 14, 76, 137, 15, 75, 137, 14, 76, 137, 16, 76, 138, 15, 77, 138, 16, 76, 138, 15, 77, 138, 16, 76, 138, 15, 77,
				138, 16, 76, 138, 15, 77, 138, 16, 76, 138, 15, 77, 138, 15, 77, 138, 13, 77, 138, 15, 76, 139, 13, 77, 138, 15, 76, 139, 13, 77, 138,
				15, 76, 139, 13, 77, 138, 15, 76, 139, 13, 77, 138, 15, 76, 139, 13, 77, 138, 15, 76, 139, 13, 77, 138, 15, 76, 139, 15, 76, 139, 19,
				76, 145, 16, 74, 138, 17, 78, 132, 15, 79, 127, 13, 75, 124, 19, 76, 131, 25, 73, 135, 32, 66, 101, 45, 102, 131, 36, 111, 176, 25,
				103, 175, 23, 102, 179, 23, 102, 179, 23, 102, 179, 22, 101, 178, 23, 102, 179, 23, 102, 179, 23, 102, 179, 23, 102, 179, 23, 102,
				179, 23, 102, 179, 23, 102, 179, 23, 102, 179, 23, 102, 179, 23, 102, 179, 23, 102, 179, 21, 103, 177, 21, 103, 177, 21, 103, 177, 21,
				103, 177, 21, 103, 177, 21, 103, 177, 21, 103, 177, 21, 103, 177, 21, 103, 177, 21, 103, 177, 21, 103, 177, 21, 103, 177, 21, 103,
				177, 21, 103, 177, 21, 103, 177, 23, 102, 181, 26, 100, 185, 26, 101, 184, 25, 104, 173, 22, 101, 167, 23, 98, 165, 33, 103, 173, 37,
				100, 177, 40, 88, 136, 14, 86, 124, 0, 83, 155, 8, 94, 167, 10, 94, 167, 9, 93, 166, 8, 92, 165, 8, 92, 165, 8, 92, 165, 8, 92, 165,
				9, 93, 166, 7, 91, 164, 7, 91, 164, 7, 91, 164, 7, 91, 164, 7, 91, 164, 7, 91, 164, 7, 91, 164, 7, 91, 164, 7, 91, 163, 7, 91, 163, 7,
				91, 163, 7, 91, 163, 7, 91, 163, 7, 91, 163, 7, 91, 163, 7, 91, 163, 7, 91, 163, 7, 91, 163, 7, 91, 163, 7, 91, 163, 7, 91, 163, 7,
				91, 163, 7, 91, 163, 7, 90, 166, 9, 89, 176, 9, 89, 176, 10, 92, 168, 7, 89, 162, 9, 87, 161, 19, 95, 173, 20, 91, 179, 23, 78, 132,
				14, 91, 137, 16, 109, 189, 7, 94, 171, 8, 94, 167, 7, 93, 168, 7, 93, 166, 6, 92, 167, 6, 92, 165, 6, 92, 167, 6, 92, 165, 6, 92, 167,
				6, 92, 165, 6, 92, 167, 6, 92, 165, 6, 92, 167, 6, 92, 165, 6, 92, 167, 6, 92, 165, 6, 93, 164, 6, 93, 164, 6, 93, 164, 6, 93, 164, 6,
				93, 164, 6, 93, 164, 6, 93, 164, 6, 93, 164, 6, 93, 164, 6, 93, 164, 6, 93, 164, 6, 93, 164, 6, 93, 164, 6, 93, 164, 6, 93, 164, 6,
				92, 167, 7, 89, 175, 7, 89, 175, 7, 93, 168, 7, 91, 163, 10, 89, 164, 17, 95, 177, 17, 94, 186, 22, 81, 139, 10, 81, 135, 9, 98, 188,
				7, 92, 173, 9, 92, 168, 8, 91, 169, 7, 90, 166, 7, 90, 168, 7, 90, 166, 7, 90, 168, 7, 90, 166, 9, 92, 170, 9, 92, 168, 9, 92, 170, 9,
				92, 168, 9, 92, 170, 9, 92, 168, 9, 92, 170, 9, 92, 168, 9, 92, 168, 9, 93, 166, 9, 93, 166, 9, 93, 166, 9, 93, 166, 9, 93, 166, 9,
				93, 166, 9, 93, 166, 9, 93, 166, 9, 93, 166, 9, 93, 166, 9, 93, 166, 9, 93, 166, 9, 93, 166, 9, 93, 166, 9, 92, 168, 5, 90, 171, 4,
				89, 169, 8, 92, 162, 9, 94, 161, 10, 90, 161, 14, 93, 172, 12, 91, 183, 22, 83, 138, 25, 81, 140, 16, 89, 183, 10, 91, 172, 9, 92,
				168, 8, 91, 167, 7, 90, 166, 7, 90, 166, 6, 89, 165, 6, 89, 165, 6, 89, 165, 7, 90, 166, 7, 90, 166, 7, 90, 166, 7, 90, 166, 7, 90,
				166, 7, 90, 166, 7, 90, 166, 7, 90, 166, 7, 90, 166, 7, 90, 166, 7, 90, 166, 7, 90, 166, 7, 90, 166, 7, 90, 166, 7, 90, 166, 7, 90,
				166, 7, 90, 166, 7, 90, 166, 7, 90, 166, 7, 90, 166, 7, 90, 166, 7, 90, 166, 7, 90, 166, 5, 91, 166, 5, 92, 169, 1, 92, 165, 6, 95,
				161, 11, 96, 160, 11, 91, 160, 13, 90, 168, 11, 91, 178, 22, 83, 137, 44, 73, 133, 38, 85, 177, 20, 91, 169, 12, 94, 167, 12, 94, 167,
				13, 95, 168, 14, 96, 169, 14, 96, 169, 13, 95, 168, 12, 94, 167, 13, 95, 168, 13, 95, 168, 13, 95, 168, 13, 95, 168, 13, 95, 168, 13,
				95, 168, 13, 95, 168, 13, 95, 168, 13, 95, 169, 13, 95, 169, 13, 95, 169, 13, 95, 169, 13, 95, 169, 13, 95, 169, 13, 95, 169, 13, 95,
				169, 13, 95, 169, 13, 95, 169, 13, 95, 169, 13, 95, 169, 13, 95, 169, 13, 95, 169, 13, 95, 169, 10, 96, 171, 1, 97, 171, 4, 103, 171,
				6, 100, 162, 13, 101, 164, 15, 95, 164, 17, 93, 168, 22, 97, 180, 24, 85, 132, 69, 64, 122, 71, 76, 160, 49, 73, 145, 41, 76, 140, 41,
				76, 142, 42, 77, 141, 43, 78, 144, 43, 78, 142, 42, 77, 143, 41, 76, 140, 42, 77, 143, 42, 77, 141, 42, 77, 143, 42, 77, 141, 42, 77,
				143, 42, 77, 141, 42, 77, 143, 42, 77, 143, 42, 77, 145, 42, 76, 147, 42, 76, 147, 42, 76, 147, 42, 76, 147, 42, 76, 147, 42, 76, 147,
				42, 76, 147, 42, 76, 147, 42, 76, 147, 42, 76, 147, 42, 76, 147, 42, 76, 147, 42, 76, 147, 42, 76, 147, 40, 77, 147, 34, 76, 148, 38,
				81, 150, 39, 79, 141, 45, 79, 142, 45, 74, 142, 46, 74, 147, 50, 79, 155, 45, 69, 113, 97, 55, 103, 116, 60, 131, 119, 61, 122, 119,
				60, 114, 119, 60, 116, 119, 60, 114, 120, 61, 117, 120, 61, 115, 120, 61, 117, 119, 60, 114, 119, 60, 116, 119, 60, 114, 119, 60, 116,
				119, 60, 114, 119, 60, 116, 119, 60, 114, 119, 60, 116, 119, 60, 116, 119, 59, 119, 119, 59, 119, 119, 59, 119, 119, 59, 119, 119, 59,
				119, 119, 59, 119, 119, 59, 119, 119, 59, 119, 119, 59, 119, 119, 59, 119, 119, 59, 119, 119, 59, 119, 119, 59, 119, 119, 59, 119,
				119, 59, 119, 122, 57, 121, 126, 53, 126, 132, 54, 129, 130, 54, 119, 132, 56, 121, 127, 54, 125, 124, 57, 128, 125, 65, 135, 106, 61,
				100, 116, 40, 76, 145, 40, 96, 148, 26, 75, 153, 23, 69, 152, 22, 70, 152, 22, 68, 153, 23, 71, 153, 23, 69, 153, 23, 71, 152, 22, 68,
				153, 23, 71, 153, 23, 69, 153, 23, 71, 153, 23, 69, 153, 23, 71, 153, 23, 69, 153, 23, 71, 153, 23, 71, 153, 22, 72, 153, 22, 74, 153,
				22, 74, 153, 22, 74, 153, 22, 74, 153, 22, 74, 153, 22, 74, 153, 22, 74, 153, 22, 74, 153, 22, 74, 153, 22, 74, 153, 22, 74, 153, 22,
				74, 153, 22, 74, 153, 22, 74, 155, 20, 76, 160, 16, 77, 166, 18, 78, 161, 16, 71, 161, 20, 73, 154, 19, 78, 151, 23, 82, 150, 33, 86,
				122, 34, 59, 135, 27, 50, 170, 21, 59, 180, 14, 54, 185, 9, 48, 184, 7, 49, 184, 8, 47, 184, 7, 49, 185, 9, 48, 185, 8, 50, 184, 8,
				47, 185, 8, 50, 185, 9, 48, 185, 8, 50, 185, 9, 48, 185, 8, 50, 185, 9, 48, 185, 8, 50, 185, 8, 50, 187, 7, 52, 187, 7, 52, 187, 7,
				52, 187, 7, 52, 187, 7, 52, 187, 7, 52, 187, 7, 52, 187, 7, 52, 187, 7, 52, 187, 7, 52, 187, 7, 52, 187, 7, 52, 187, 7, 52, 187, 7,
				52, 187, 7, 52, 184, 9, 50, 180, 10, 46, 179, 14, 44, 176, 12, 37, 177, 14, 43, 171, 13, 48, 169, 18, 51, 172, 28, 53, 140, 31, 36,
				156, 25, 33, 193, 15, 39, 195, 4, 37, 198, 0, 36, 196, 0, 34, 195, 0, 33, 196, 0, 34, 197, 0, 35, 196, 0, 34, 196, 0, 34, 197, 0, 35,
				197, 0, 35, 197, 0, 35, 197, 0, 35, 197, 0, 35, 197, 0, 35, 197, 0, 35, 197, 0, 35, 198, 0, 35, 198, 0, 35, 198, 0, 37, 198, 0, 35,
				198, 0, 37, 198, 0, 35, 198, 0, 37, 198, 0, 35, 198, 0, 37, 198, 0, 35, 198, 0, 37, 198, 0, 35, 198, 0, 37, 198, 0, 35, 198, 0, 37,
				195, 0, 35, 190, 1, 31, 189, 5, 29, 186, 3, 23, 187, 5, 27, 181, 4, 32, 182, 8, 33, 187, 19, 32, 149, 24, 20, 170, 25, 20, 208, 14,
				25, 201, 6, 36, 199, 3, 41, 197, 1, 39, 196, 0, 38, 196, 0, 38, 197, 1, 39, 197, 1, 39, 197, 1, 39, 197, 1, 39, 197, 1, 39, 197, 1,
				39, 197, 1, 39, 197, 1, 39, 197, 1, 39, 197, 1, 39, 197, 1, 37, 199, 1, 37, 199, 1, 36, 199, 1, 37, 199, 1, 36, 199, 1, 37, 199, 1,
				36, 199, 1, 37, 199, 1, 36, 199, 1, 37, 199, 1, 36, 199, 1, 37, 199, 1, 36, 199, 1, 37, 199, 1, 36, 199, 1, 37, 199, 1, 37, 200, 0,
				41, 203, 1, 41, 199, 0, 34, 200, 0, 36, 196, 0, 40, 198, 4, 38, 207, 16, 32, 165, 23, 22, 174, 19, 14, 212, 8, 20, 201, 4, 32, 196, 2,
				37, 194, 0, 37, 193, 0, 34, 194, 0, 37, 194, 0, 35, 194, 0, 37, 194, 0, 35, 195, 1, 38, 195, 1, 36, 195, 1, 38, 195, 1, 36, 195, 1,
				38, 195, 1, 36, 195, 1, 38, 195, 1, 36, 196, 1, 35, 196, 1, 35, 196, 1, 35, 196, 1, 35, 196, 1, 35, 195, 1, 35, 195, 1, 35, 195, 1,
				35, 195, 1, 35, 195, 1, 35, 195, 1, 35, 196, 1, 33, 196, 1, 35, 196, 1, 33, 196, 1, 35, 198, 0, 35, 201, 0, 39, 204, 0, 39, 200, 0,
				34, 199, 0, 34, 197, 0, 36, 202, 1, 35, 213, 12, 31, 168, 19, 23, 172, 17, 21, 220, 14, 37, 202, 5, 35, 196, 5, 38, 194, 3, 37, 192,
				1, 34, 193, 0, 34, 193, 0, 33, 194, 0, 35, 195, 1, 35, 196, 2, 37, 196, 2, 36, 196, 0, 36, 195, 0, 34, 194, 0, 34, 194, 0, 33, 194, 0,
				34, 195, 0, 34, 194, 0, 34, 194, 1, 32, 193, 0, 31, 193, 0, 31, 194, 1, 32, 193, 2, 33, 195, 4, 35, 196, 5, 36, 192, 1, 32, 192, 1,
				32, 192, 1, 32, 195, 2, 31, 195, 2, 33, 196, 3, 32, 196, 3, 34, 198, 3, 33, 198, 0, 33, 197, 2, 32, 197, 7, 33, 194, 6, 31, 194, 1,
				28, 203, 6, 33, 206, 7, 30, 162, 15, 21, 163, 18, 25, 207, 10, 37, 194, 3, 34, 194, 5, 37, 195, 6, 38, 196, 7, 39, 197, 6, 39, 196, 5,
				38, 196, 5, 38, 195, 4, 37, 196, 5, 38, 196, 5, 38, 198, 4, 38, 198, 4, 38, 198, 4, 38, 198, 4, 38, 198, 4, 38, 198, 4, 38, 199, 5,
				39, 198, 5, 36, 198, 4, 38, 196, 5, 36, 196, 5, 38, 194, 5, 35, 194, 5, 37, 194, 5, 35, 196, 7, 39, 195, 6, 36, 194, 5, 35, 193, 2,
				33, 192, 1, 32, 194, 1, 32, 195, 2, 33, 195, 2, 31, 197, 0, 30, 195, 1, 28, 192, 6, 30, 190, 4, 27, 191, 3, 27, 203, 11, 36, 211, 14,
				41, 171, 25, 35, 157, 35, 32, 192, 21, 39, 186, 3, 31, 189, 1, 34, 190, 2, 35, 191, 3, 36, 191, 3, 36, 191, 3, 36, 191, 1, 35, 191, 1,
				35, 190, 0, 34, 191, 1, 35, 191, 1, 35, 191, 1, 35, 192, 1, 35, 191, 0, 34, 191, 0, 34, 190, 0, 33, 191, 0, 34, 192, 1, 34, 192, 1,
				35, 191, 2, 34, 191, 1, 35, 189, 2, 33, 188, 0, 33, 188, 1, 32, 192, 4, 37, 191, 4, 35, 189, 2, 33, 189, 0, 32, 189, 0, 32, 191, 0,
				33, 193, 2, 35, 197, 2, 36, 201, 0, 36, 199, 0, 34, 196, 1, 35, 192, 1, 32, 189, 0, 30, 195, 6, 36, 201, 8, 39, 163, 18, 33, 135, 38,
				29, 161, 28, 33, 175, 38, 48, 175, 35, 48, 174, 34, 47, 173, 33, 46, 172, 32, 45, 173, 33, 46, 175, 33, 47, 176, 34, 48, 175, 33, 47,
				176, 34, 48, 176, 34, 48, 176, 34, 48, 178, 33, 48, 178, 33, 48, 177, 32, 47, 176, 31, 46, 178, 31, 47, 178, 31, 47, 177, 32, 49, 177,
				32, 47, 178, 33, 50, 177, 35, 49, 178, 36, 52, 178, 36, 50, 177, 35, 51, 176, 34, 48, 175, 33, 49, 174, 32, 46, 176, 31, 48, 176, 31,
				46, 177, 30, 48, 178, 29, 48, 180, 29, 48, 179, 28, 47, 181, 32, 52, 178, 33, 50, 173, 31, 47, 176, 31, 46, 179, 28, 47, 146, 33, 37,
			]
		),
	},
	{
		c: "se",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				37, 84, 106, 29, 90, 129, 19, 86, 135, 24, 90, 141, 30, 83, 129, 35, 83, 125, 35, 81, 122, 31, 82, 125, 23, 84, 133, 19, 89, 139, 25,
				92, 136, 37, 94, 125, 46, 87, 99, 76, 95, 82, 169, 168, 112, 213, 195, 87, 205, 191, 47, 193, 198, 40, 176, 195, 73, 116, 143, 109,
				49, 85, 105, 35, 82, 116, 31, 87, 123, 28, 87, 122, 27, 86, 124, 27, 83, 132, 27, 81, 141, 27, 81, 144, 26, 81, 140, 24, 82, 134, 24,
				84, 130, 25, 87, 126, 26, 87, 124, 26, 87, 124, 26, 85, 130, 24, 83, 134, 25, 81, 138, 27, 82, 137, 29, 81, 134, 32, 81, 126, 37, 83,
				114, 38, 79, 97, 32, 87, 117, 22, 95, 146, 7, 90, 156, 13, 95, 164, 18, 87, 153, 25, 87, 149, 27, 88, 149, 20, 87, 148, 13, 91, 157,
				10, 96, 163, 15, 96, 154, 30, 97, 139, 41, 87, 105, 77, 97, 82, 199, 193, 123, 244, 218, 81, 236, 213, 33, 224, 226, 30, 206, 226, 75,
				133, 163, 121, 46, 89, 114, 28, 88, 130, 24, 96, 144, 20, 96, 143, 16, 93, 144, 15, 89, 155, 18, 87, 167, 21, 87, 171, 21, 86, 167,
				21, 86, 160, 22, 88, 154, 22, 91, 150, 17, 92, 144, 16, 91, 145, 16, 90, 151, 17, 88, 156, 18, 87, 160, 19, 87, 158, 22, 86, 153, 27,
				86, 143, 34, 88, 130, 34, 82, 108, 30, 88, 125, 17, 95, 155, 1, 90, 164, 5, 96, 176, 8, 87, 165, 15, 87, 163, 19, 90, 167, 10, 86,
				163, 5, 92, 172, 3, 95, 174, 6, 92, 160, 28, 99, 149, 45, 94, 117, 73, 92, 78, 197, 187, 110, 248, 217, 60, 242, 213, 10, 228, 224, 8,
				203, 220, 56, 130, 161, 117, 45, 93, 123, 27, 94, 146, 14, 94, 153, 9, 94, 153, 6, 93, 156, 5, 88, 167, 7, 87, 179, 11, 88, 181, 13,
				88, 175, 14, 87, 169, 15, 88, 164, 15, 91, 162, 9, 90, 154, 8, 90, 156, 8, 89, 163, 8, 90, 167, 9, 90, 168, 10, 90, 166, 14, 88, 162,
				20, 88, 154, 29, 89, 139, 30, 81, 112, 35, 90, 129, 21, 95, 156, 1, 89, 160, 6, 99, 175, 4, 87, 168, 11, 89, 171, 12, 88, 176, 9, 88,
				177, 4, 91, 180, 1, 90, 173, 7, 89, 162, 34, 102, 158, 51, 96, 127, 74, 90, 79, 197, 186, 107, 251, 218, 52, 248, 216, 4, 236, 224, 6,
				207, 216, 54, 129, 160, 116, 46, 97, 127, 25, 94, 150, 10, 90, 158, 8, 91, 162, 7, 91, 166, 5, 90, 175, 4, 89, 183, 6, 91, 180, 9, 91,
				171, 9, 91, 168, 9, 91, 170, 10, 92, 168, 8, 91, 162, 8, 90, 162, 7, 89, 169, 6, 91, 170, 3, 95, 163, 3, 95, 161, 9, 92, 165, 16, 90,
				161, 26, 90, 145, 32, 83, 118, 35, 86, 129, 22, 92, 156, 2, 89, 154, 4, 96, 166, 8, 92, 169, 9, 89, 172, 10, 88, 178, 8, 87, 180, 4,
				89, 178, 4, 92, 173, 11, 92, 164, 32, 96, 156, 48, 90, 124, 76, 93, 84, 194, 185, 105, 248, 217, 49, 248, 214, 4, 240, 222, 10, 211,
				214, 59, 128, 159, 117, 41, 94, 125, 21, 89, 150, 14, 91, 166, 12, 90, 169, 10, 90, 170, 6, 90, 177, 3, 91, 180, 3, 93, 173, 5, 94,
				164, 4, 94, 165, 3, 93, 172, 5, 92, 171, 8, 91, 165, 8, 90, 165, 8, 88, 171, 4, 91, 168, 1, 99, 156, 0, 100, 153, 4, 94, 164, 12, 90,
				165, 23, 89, 150, 29, 81, 119, 30, 80, 133, 21, 91, 163, 6, 95, 161, 0, 94, 160, 9, 96, 166, 7, 91, 165, 8, 90, 173, 3, 86, 170, 1,
				92, 172, 5, 100, 172, 11, 97, 164, 25, 94, 150, 41, 88, 119, 79, 101, 89, 188, 184, 104, 246, 217, 54, 246, 212, 7, 240, 221, 13, 212,
				215, 63, 127, 160, 121, 38, 95, 128, 19, 91, 153, 15, 96, 170, 11, 93, 168, 8, 91, 167, 4, 92, 172, 1, 93, 175, 1, 94, 169, 2, 95,
				161, 2, 95, 164, 1, 93, 174, 3, 92, 174, 7, 92, 169, 7, 91, 167, 7, 89, 173, 2, 92, 169, 0, 100, 156, 0, 103, 154, 2, 96, 166, 9, 90,
				169, 21, 90, 157, 25, 80, 124, 33, 84, 146, 19, 90, 172, 8, 97, 167, 1, 97, 161, 2, 92, 155, 7, 94, 159, 8, 93, 164, 5, 93, 166, 1,
				99, 167, 0, 97, 161, 7, 96, 157, 26, 101, 153, 39, 93, 121, 75, 103, 89, 189, 189, 109, 248, 220, 61, 245, 212, 11, 239, 220, 13, 213,
				217, 65, 130, 164, 127, 38, 96, 131, 15, 90, 151, 9, 92, 162, 8, 93, 161, 7, 94, 160, 3, 94, 166, 0, 95, 171, 1, 96, 167, 2, 96, 160,
				3, 95, 166, 3, 92, 176, 4, 92, 177, 8, 93, 172, 7, 92, 170, 6, 90, 174, 1, 93, 171, 0, 101, 162, 0, 102, 161, 2, 96, 170, 9, 89, 172,
				21, 91, 164, 24, 83, 133, 38, 88, 151, 22, 91, 173, 1, 83, 154, 6, 97, 162, 8, 94, 156, 16, 97, 160, 13, 93, 161, 11, 94, 164, 6, 99,
				166, 3, 94, 157, 8, 92, 153, 29, 103, 156, 42, 96, 125, 67, 97, 82, 186, 188, 107, 249, 224, 63, 243, 212, 8, 235, 216, 7, 209, 213,
				58, 128, 160, 121, 38, 93, 126, 15, 87, 146, 10, 89, 158, 10, 91, 157, 10, 92, 156, 7, 93, 163, 4, 94, 169, 4, 94, 164, 6, 94, 158, 7,
				93, 163, 8, 90, 173, 9, 89, 176, 13, 90, 174, 12, 89, 172, 9, 88, 175, 5, 92, 173, 2, 99, 167, 2, 99, 166, 6, 93, 169, 12, 87, 168,
				21, 89, 164, 19, 79, 132, 36, 83, 134, 34, 98, 167, 9, 85, 149, 18, 99, 160, 27, 100, 161, 25, 93, 156, 26, 92, 159, 19, 90, 160, 16,
				96, 165, 15, 100, 165, 16, 95, 157, 35, 101, 154, 49, 97, 125, 69, 96, 81, 188, 191, 107, 246, 225, 57, 245, 216, 3, 239, 221, 6, 213,
				215, 55, 131, 159, 113, 46, 95, 120, 30, 93, 148, 31, 100, 166, 26, 95, 160, 22, 92, 155, 19, 93, 161, 15, 93, 165, 16, 93, 161, 19,
				93, 155, 20, 92, 157, 20, 91, 165, 22, 89, 170, 25, 88, 172, 24, 87, 171, 21, 89, 173, 17, 93, 171, 10, 97, 166, 10, 98, 164, 18, 92,
				163, 24, 87, 160, 33, 93, 160, 29, 85, 133, 39, 77, 106, 40, 91, 131, 42, 102, 141, 32, 94, 133, 33, 88, 130, 36, 86, 131, 39, 87,
				137, 38, 89, 139, 33, 90, 140, 31, 93, 141, 34, 92, 137, 48, 97, 131, 56, 92, 104, 79, 98, 71, 198, 198, 105, 242, 221, 48, 247, 219,
				6, 246, 226, 12, 220, 216, 52, 138, 158, 95, 53, 91, 94, 37, 85, 117, 35, 88, 133, 38, 87, 135, 39, 87, 135, 36, 88, 138, 33, 90, 139,
				34, 90, 135, 36, 89, 129, 37, 88, 131, 37, 87, 138, 39, 86, 142, 42, 86, 144, 40, 85, 143, 37, 87, 142, 33, 90, 141, 27, 94, 139, 28,
				94, 137, 35, 89, 132, 40, 84, 127, 41, 86, 126, 39, 84, 112, 68, 93, 88, 62, 94, 89, 74, 112, 108, 60, 97, 98, 58, 89, 96, 71, 98,
				108, 70, 95, 105, 75, 101, 110, 67, 97, 109, 61, 94, 105, 66, 97, 104, 78, 103, 99, 81, 100, 77, 99, 108, 55, 191, 186, 77, 241, 219,
				45, 243, 212, 7, 242, 216, 10, 224, 209, 44, 156, 165, 76, 85, 109, 73, 73, 102, 92, 65, 95, 100, 70, 93, 105, 73, 93, 108, 70, 95,
				107, 67, 97, 105, 67, 98, 101, 69, 97, 98, 70, 97, 98, 70, 96, 102, 72, 95, 103, 75, 95, 102, 74, 96, 101, 71, 98, 97, 68, 100, 96,
				63, 103, 100, 64, 102, 97, 71, 97, 89, 74, 93, 85, 76, 100, 93, 60, 89, 83, 173, 187, 134, 190, 206, 136, 181, 196, 131, 185, 198,
				138, 189, 199, 145, 186, 194, 140, 185, 193, 133, 187, 194, 132, 186, 193, 136, 192, 196, 142, 191, 194, 136, 189, 192, 125, 194, 198,
				117, 197, 199, 97, 219, 212, 73, 247, 224, 40, 241, 211, 3, 242, 210, 4, 242, 221, 40, 214, 212, 80, 179, 190, 93, 186, 201, 123, 186,
				196, 132, 190, 190, 138, 193, 189, 139, 189, 192, 135, 186, 195, 129, 186, 195, 127, 187, 195, 127, 188, 194, 128, 187, 194, 131, 189,
				194, 131, 192, 193, 131, 192, 194, 128, 190, 195, 125, 188, 197, 126, 184, 198, 132, 185, 197, 131, 192, 192, 122, 193, 189, 121, 202,
				208, 147, 143, 158, 110, 198, 202, 89, 217, 221, 69, 219, 216, 67, 226, 221, 75, 225, 220, 79, 228, 223, 78, 230, 225, 66, 228, 222,
				57, 235, 221, 64, 232, 212, 63, 233, 215, 62, 241, 225, 66, 230, 221, 55, 223, 219, 45, 231, 223, 34, 237, 217, 12, 249, 219, 4, 247,
				211, 0, 246, 216, 7, 236, 227, 34, 214, 216, 36, 224, 225, 53, 231, 226, 63, 235, 218, 69, 238, 215, 69, 235, 218, 61, 230, 222, 53,
				229, 223, 53, 230, 222, 57, 229, 221, 60, 229, 221, 62, 230, 220, 64, 231, 218, 65, 232, 218, 63, 233, 220, 62, 229, 219, 62, 224,
				218, 69, 230, 220, 77, 238, 217, 73, 231, 207, 69, 235, 223, 98, 172, 173, 75, 200, 200, 51, 240, 238, 41, 233, 220, 29, 236, 220, 32,
				234, 222, 36, 227, 215, 23, 233, 221, 13, 236, 220, 7, 242, 217, 12, 248, 215, 18, 250, 218, 19, 244, 218, 13, 234, 217, 10, 236, 227,
				18, 234, 225, 14, 238, 217, 4, 250, 218, 4, 251, 211, 0, 248, 214, 1, 240, 225, 5, 228, 223, 4, 233, 226, 11, 235, 220, 14, 242, 215,
				22, 246, 213, 24, 243, 217, 14, 238, 221, 5, 237, 221, 8, 238, 219, 13, 238, 219, 16, 236, 219, 17, 237, 219, 18, 238, 218, 19, 238,
				216, 18, 240, 219, 16, 238, 217, 16, 235, 215, 26, 240, 216, 34, 247, 214, 31, 239, 205, 28, 243, 221, 61, 181, 172, 47, 205, 205, 45,
				239, 235, 28, 232, 216, 19, 231, 214, 23, 235, 221, 34, 230, 219, 26, 231, 220, 11, 236, 220, 4, 242, 214, 9, 250, 215, 19, 252, 216,
				17, 242, 211, 6, 236, 216, 7, 238, 229, 16, 229, 217, 5, 240, 218, 8, 250, 217, 9, 252, 210, 2, 248, 211, 1, 238, 219, 6, 235, 225,
				13, 236, 223, 17, 236, 215, 19, 242, 211, 30, 247, 210, 33, 243, 214, 21, 239, 218, 11, 238, 218, 14, 239, 216, 21, 238, 217, 23, 237,
				217, 22, 237, 218, 19, 237, 218, 17, 238, 217, 14, 243, 218, 12, 242, 216, 14, 237, 214, 23, 242, 216, 29, 248, 213, 27, 241, 206, 25,
				244, 223, 56, 179, 169, 39, 211, 214, 77, 227, 227, 54, 233, 225, 65, 231, 222, 70, 227, 221, 75, 229, 225, 75, 229, 225, 60, 235,
				226, 56, 240, 220, 62, 245, 217, 68, 247, 217, 63, 242, 217, 52, 239, 223, 49, 236, 228, 46, 230, 218, 26, 237, 216, 13, 244, 213, 5,
				251, 211, 2, 253, 217, 15, 238, 220, 29, 234, 225, 46, 235, 225, 59, 239, 224, 69, 241, 217, 75, 240, 214, 74, 236, 218, 63, 232, 222,
				54, 231, 222, 56, 233, 220, 63, 233, 219, 64, 233, 220, 61, 232, 221, 58, 231, 222, 54, 231, 220, 50, 237, 220, 50, 237, 220, 52, 232,
				218, 57, 236, 219, 63, 242, 218, 60, 235, 212, 57, 242, 229, 85, 177, 173, 59, 168, 179, 101, 172, 183, 87, 180, 188, 107, 178, 185,
				116, 169, 179, 116, 174, 185, 120, 174, 185, 111, 180, 186, 109, 184, 182, 115, 185, 177, 116, 186, 175, 109, 191, 181, 101, 189, 183,
				87, 189, 185, 68, 222, 213, 60, 239, 220, 25, 241, 213, 1, 248, 213, 1, 250, 220, 27, 216, 206, 52, 187, 187, 66, 181, 183, 83, 186,
				186, 101, 188, 184, 107, 187, 183, 106, 183, 187, 98, 178, 191, 92, 178, 190, 94, 181, 188, 99, 183, 187, 98, 183, 187, 94, 182, 188,
				92, 180, 190, 91, 179, 188, 89, 184, 189, 89, 187, 189, 91, 181, 186, 93, 182, 187, 94, 188, 188, 91, 184, 184, 86, 190, 197, 104,
				142, 152, 78, 82, 103, 82, 85, 112, 90, 79, 108, 102, 81, 110, 115, 78, 108, 117, 79, 110, 117, 80, 112, 112, 80, 110, 110, 84, 109,
				118, 84, 105, 119, 87, 104, 113, 98, 111, 105, 97, 107, 77, 109, 115, 51, 198, 195, 75, 242, 226, 41, 239, 214, 0, 244, 215, 1, 240,
				219, 36, 185, 183, 70, 115, 127, 64, 98, 117, 83, 98, 119, 101, 97, 117, 101, 94, 117, 97, 88, 121, 93, 83, 124, 91, 85, 122, 95, 89,
				119, 98, 92, 118, 95, 93, 118, 91, 92, 119, 90, 89, 122, 92, 86, 119, 91, 93, 120, 91, 95, 120, 94, 88, 118, 93, 88, 120, 92, 93, 121,
				88, 93, 118, 82, 100, 129, 91, 82, 111, 78, 40, 75, 98, 45, 92, 127, 31, 85, 133, 34, 92, 142, 32, 89, 138, 30, 88, 131, 31, 90, 130,
				29, 88, 129, 32, 89, 140, 32, 87, 143, 36, 86, 137, 52, 92, 129, 55, 86, 94, 76, 97, 62, 195, 199, 100, 239, 225, 52, 237, 215, 3,
				241, 218, 3, 233, 221, 49, 169, 177, 101, 69, 94, 84, 51, 88, 110, 46, 90, 126, 41, 91, 119, 37, 93, 112, 31, 96, 113, 27, 97, 118,
				29, 95, 123, 34, 92, 126, 39, 90, 124, 42, 89, 121, 39, 91, 120, 34, 94, 121, 32, 91, 119, 40, 92, 122, 41, 93, 124, 34, 91, 123, 32,
				92, 121, 37, 93, 117, 39, 92, 110, 41, 93, 106, 41, 88, 95, 41, 87, 138, 29, 91, 161, 18, 93, 168, 18, 99, 171, 14, 94, 161, 16, 96,
				158, 16, 97, 156, 14, 96, 157, 15, 98, 167, 15, 96, 169, 19, 93, 163, 38, 101, 158, 48, 97, 124, 70, 100, 80, 189, 197, 111, 240, 224,
				63, 240, 216, 12, 240, 221, 7, 229, 224, 61, 165, 180, 129, 50, 86, 109, 38, 91, 147, 29, 94, 161, 21, 94, 151, 17, 97, 144, 12, 99,
				146, 8, 100, 153, 10, 98, 159, 15, 95, 163, 21, 92, 163, 25, 89, 162, 22, 91, 161, 16, 95, 161, 13, 93, 157, 22, 93, 160, 24, 95, 163,
				16, 93, 161, 12, 94, 159, 17, 95, 157, 20, 95, 150, 22, 93, 141, 27, 88, 121, 37, 90, 146, 18, 89, 164, 11, 94, 168, 8, 98, 170, 3,
				94, 165, 6, 97, 167, 5, 96, 167, 4, 95, 166, 6, 97, 167, 5, 93, 164, 9, 92, 162, 31, 103, 165, 44, 97, 131, 67, 96, 84, 185, 187, 110,
				244, 218, 66, 247, 214, 18, 239, 219, 10, 226, 224, 65, 160, 181, 134, 47, 90, 117, 30, 95, 153, 17, 95, 165, 10, 95, 164, 8, 97, 160,
				4, 99, 158, 2, 100, 159, 3, 98, 164, 6, 95, 169, 10, 92, 173, 15, 89, 176, 13, 90, 175, 8, 93, 174, 6, 93, 170, 13, 91, 167, 16, 93,
				168, 10, 92, 167, 6, 93, 168, 6, 95, 169, 9, 95, 164, 17, 96, 155, 23, 88, 129, 27, 84, 135, 16, 93, 159, 9, 94, 157, 6, 97, 161, 1,
				95, 165, 1, 95, 170, 2, 95, 173, 2, 93, 168, 3, 92, 161, 5, 92, 156, 11, 93, 157, 28, 101, 159, 40, 93, 127, 71, 96, 87, 193, 187,
				115, 249, 213, 66, 252, 211, 18, 239, 217, 10, 225, 225, 64, 156, 179, 127, 47, 94, 111, 23, 94, 140, 11, 96, 158, 6, 94, 168, 5, 94,
				169, 4, 95, 161, 3, 97, 154, 1, 97, 155, 1, 95, 161, 4, 91, 169, 9, 88, 175, 8, 87, 176, 3, 90, 174, 4, 91, 169, 11, 89, 162, 12, 89,
				159, 10, 90, 161, 6, 91, 163, 2, 92, 168, 2, 93, 165, 13, 94, 154, 21, 85, 127, 25, 85, 136, 13, 93, 157, 7, 93, 154, 5, 96, 161, 1,
				93, 169, 1, 93, 178, 3, 94, 180, 2, 91, 174, 2, 90, 163, 10, 94, 160, 13, 95, 161, 21, 95, 155, 36, 90, 127, 74, 99, 93, 195, 189,
				116, 252, 216, 62, 252, 212, 11, 239, 218, 6, 226, 226, 62, 157, 180, 123, 46, 93, 106, 23, 92, 138, 15, 97, 164, 9, 93, 177, 7, 90,
				180, 6, 92, 170, 5, 95, 158, 2, 96, 157, 1, 95, 163, 3, 93, 170, 8, 89, 177, 7, 88, 180, 2, 91, 178, 4, 92, 173, 10, 90, 166, 12, 89,
				162, 10, 90, 164, 7, 91, 166, 2, 93, 172, 2, 93, 169, 13, 94, 158, 21, 84, 130, 25, 87, 138, 13, 92, 159, 7, 92, 157, 6, 95, 166, 4,
				92, 177, 5, 92, 185, 3, 88, 184, 3, 87, 178, 4, 86, 166, 11, 92, 163, 13, 92, 162, 22, 94, 158, 39, 94, 133, 73, 101, 96, 189, 188,
				109, 246, 217, 50, 248, 213, 1, 237, 221, 3, 223, 225, 57, 159, 181, 122, 54, 97, 111, 27, 91, 142, 14, 90, 165, 10, 87, 182, 10, 87,
				188, 9, 90, 179, 7, 93, 167, 4, 95, 164, 3, 95, 167, 5, 94, 171, 9, 91, 176, 8, 90, 180, 3, 92, 181, 3, 92, 179, 10, 90, 172, 12, 90,
				168, 11, 91, 169, 8, 91, 172, 3, 93, 177, 4, 93, 174, 14, 93, 163, 22, 83, 135, 25, 87, 135, 14, 92, 156, 9, 91, 156, 9, 93, 165, 7,
				90, 176, 8, 90, 184, 8, 87, 183, 11, 88, 181, 13, 89, 171, 14, 90, 163, 14, 90, 159, 30, 101, 161, 46, 100, 137, 68, 98, 93, 186, 189,
				110, 244, 221, 54, 245, 217, 4, 236, 224, 8, 217, 222, 57, 158, 177, 121, 61, 100, 115, 33, 91, 144, 15, 85, 163, 12, 82, 180, 13, 82,
				186, 12, 86, 178, 10, 90, 167, 7, 92, 163, 4, 94, 164, 5, 93, 166, 8, 91, 170, 8, 90, 175, 3, 91, 179, 4, 91, 178, 11, 89, 170, 12,
				89, 166, 11, 90, 167, 9, 90, 170, 5, 92, 173, 6, 91, 171, 17, 92, 162, 25, 82, 135, 27, 85, 128, 18, 92, 148, 13, 90, 150, 14, 92,
				158, 12, 87, 166, 12, 86, 174, 16, 86, 178, 17, 86, 173, 19, 87, 165, 17, 86, 154, 16, 86, 149, 33, 99, 154, 41, 94, 126, 61, 94, 85,
				187, 196, 119, 238, 223, 65, 238, 215, 16, 234, 223, 24, 217, 221, 69, 157, 174, 123, 62, 95, 111, 37, 88, 138, 29, 91, 166, 23, 84,
				177, 19, 81, 179, 18, 84, 171, 15, 88, 160, 11, 91, 156, 8, 92, 157, 8, 92, 159, 11, 90, 162, 11, 89, 165, 6, 90, 169, 7, 90, 169, 13,
				88, 162, 15, 88, 159, 14, 89, 159, 12, 89, 161, 9, 90, 165, 10, 90, 163, 21, 91, 153, 29, 82, 130, 32, 86, 118, 25, 91, 137, 20, 91,
				137, 22, 93, 146, 20, 87, 152, 22, 85, 158, 25, 84, 161, 22, 81, 154, 24, 84, 148, 24, 85, 140, 26, 88, 138, 38, 96, 139, 40, 89, 112,
				67, 100, 87, 189, 200, 132, 233, 222, 88, 228, 211, 44, 234, 225, 56, 223, 225, 98, 160, 175, 132, 59, 88, 103, 30, 76, 118, 29, 84,
				146, 31, 84, 162, 31, 83, 165, 28, 85, 156, 25, 88, 146, 20, 91, 144, 16, 93, 146, 16, 92, 148, 20, 90, 151, 19, 90, 154, 15, 91, 157,
				17, 91, 155, 22, 89, 148, 24, 89, 147, 22, 90, 147, 21, 90, 147, 18, 90, 152, 19, 90, 149, 27, 89, 139, 34, 82, 118, 38, 85, 102, 32,
				89, 117, 27, 88, 116, 30, 90, 123, 30, 85, 128, 33, 85, 133, 36, 84, 136, 35, 82, 131, 35, 85, 127, 36, 89, 124, 40, 92, 125, 46, 96,
				123, 48, 91, 102, 74, 104, 87, 162, 174, 120, 217, 210, 113, 212, 198, 77, 217, 209, 84, 205, 206, 112, 157, 170, 139, 76, 101, 113,
				51, 90, 121, 44, 90, 132, 41, 84, 138, 40, 82, 138, 39, 84, 131, 34, 87, 123, 28, 90, 122, 25, 90, 125, 26, 89, 129, 29, 86, 132, 28,
				86, 133, 25, 87, 133, 25, 88, 130, 31, 86, 124, 32, 86, 121, 31, 87, 123, 29, 87, 124, 26, 88, 128, 27, 88, 126, 32, 85, 118, 38, 80,
				102,
			]
		),
	},
	{
		c: "us",
		data: ImageHelper.fromJson(
			42,
			28,
			[
				25, 59, 97, 78, 93, 132, 36, 59, 101, 22, 64, 124, 26, 53, 98, 74, 90, 126, 20, 59, 114, 29, 61, 110, 67, 82, 121, 14, 53, 108, 17,
				51, 115, 83, 98, 131, 25, 54, 112, 24, 61, 132, 58, 74, 108, 49, 73, 121, 20, 58, 131, 43, 62, 102, 73, 94, 123, 83, 46, 90, 167, 16,
				69, 169, 0, 58, 184, 0, 67, 202, 0, 63, 170, 0, 62, 186, 0, 57, 180, 2, 64, 177, 0, 61, 174, 0, 58, 177, 0, 61, 181, 3, 63, 178, 0,
				60, 175, 0, 57, 181, 3, 63, 178, 0, 60, 178, 0, 60, 179, 1, 61, 179, 1, 61, 179, 1, 61, 178, 0, 60, 178, 0, 60, 177, 0, 59, 40, 74,
				112, 179, 194, 233, 130, 153, 195, 20, 62, 122, 132, 159, 204, 173, 189, 225, 31, 70, 125, 92, 124, 173, 183, 198, 237, 24, 63, 118,
				48, 82, 146, 199, 214, 247, 99, 128, 186, 13, 50, 121, 171, 187, 221, 129, 153, 201, 12, 50, 123, 140, 159, 199, 199, 220, 249, 91,
				54, 98, 155, 4, 57, 179, 5, 68, 176, 0, 59, 194, 0, 55, 175, 0, 67, 182, 0, 53, 174, 0, 58, 178, 0, 62, 180, 2, 64, 180, 2, 64, 178,
				0, 60, 172, 0, 54, 172, 0, 54, 178, 0, 60, 176, 0, 58, 176, 0, 58, 176, 0, 58, 176, 0, 58, 176, 0, 58, 176, 0, 58, 176, 0, 58, 176, 0,
				58, 27, 63, 125, 60, 83, 137, 48, 83, 147, 115, 119, 157, 58, 83, 139, 67, 102, 166, 126, 130, 168, 58, 76, 126, 62, 107, 175, 56, 73,
				119, 97, 109, 151, 55, 97, 155, 84, 102, 150, 109, 116, 158, 40, 81, 137, 41, 69, 119, 148, 150, 189, 47, 80, 133, 61, 84, 126, 116,
				107, 152, 212, 192, 204, 221, 201, 210, 222, 211, 215, 221, 213, 210, 216, 198, 210, 218, 208, 207, 228, 205, 213, 225, 202, 210, 219,
				196, 204, 220, 197, 205, 227, 204, 212, 229, 206, 214, 225, 202, 210, 224, 201, 209, 223, 206, 212, 223, 206, 212, 222, 205, 211, 222,
				205, 211, 221, 204, 210, 221, 204, 210, 221, 204, 210, 221, 204, 210, 16, 52, 114, 52, 75, 129, 40, 75, 139, 191, 195, 233, 61, 86,
				142, 47, 82, 146, 186, 190, 228, 118, 136, 186, 23, 68, 136, 131, 148, 194, 151, 163, 205, 41, 83, 141, 110, 128, 176, 179, 186, 228,
				28, 69, 125, 70, 98, 148, 192, 194, 233, 88, 121, 174, 54, 77, 119, 134, 125, 170, 255, 239, 251, 255, 248, 255, 253, 242, 246, 255,
				249, 246, 255, 248, 255, 255, 251, 250, 255, 244, 252, 255, 247, 255, 255, 247, 255, 255, 247, 255, 255, 246, 254, 255, 246, 254, 255,
				245, 253, 255, 247, 255, 255, 249, 255, 255, 248, 254, 255, 248, 254, 255, 248, 254, 255, 248, 254, 255, 249, 255, 255, 249, 255, 255,
				249, 255, 36, 77, 131, 176, 209, 242, 147, 164, 194, 35, 69, 114, 155, 172, 202, 193, 201, 224, 51, 80, 120, 107, 131, 167, 207, 219,
				245, 40, 73, 118, 71, 98, 128, 214, 221, 247, 123, 148, 179, 30, 64, 99, 184, 195, 223, 152, 171, 201, 27, 62, 94, 141, 153, 179, 208,
				225, 255, 112, 71, 127, 217, 70, 124, 228, 82, 129, 218, 88, 126, 224, 78, 115, 213, 88, 132, 236, 79, 124, 223, 84, 126, 223, 84,
				126, 223, 84, 126, 223, 84, 126, 223, 84, 126, 223, 83, 128, 223, 83, 128, 223, 83, 128, 225, 82, 126, 225, 82, 126, 225, 82, 126,
				225, 82, 126, 225, 82, 126, 225, 82, 126, 225, 82, 126, 225, 82, 126, 19, 60, 114, 96, 129, 162, 88, 105, 135, 105, 139, 184, 95, 112,
				142, 140, 148, 171, 118, 147, 187, 74, 98, 134, 141, 153, 179, 64, 97, 142, 105, 132, 162, 140, 147, 173, 101, 126, 157, 107, 141,
				176, 110, 121, 149, 89, 108, 138, 133, 168, 200, 104, 116, 142, 130, 147, 193, 87, 46, 102, 159, 12, 66, 157, 11, 58, 144, 14, 52,
				158, 12, 49, 145, 20, 64, 160, 3, 48, 152, 13, 55, 152, 13, 55, 152, 13, 55, 152, 13, 55, 152, 13, 55, 152, 12, 57, 152, 12, 57, 152,
				12, 57, 154, 11, 55, 154, 11, 55, 154, 11, 55, 154, 11, 55, 154, 11, 55, 154, 11, 55, 154, 11, 55, 154, 11, 55, 18, 56, 119, 42, 73,
				104, 55, 80, 121, 192, 221, 255, 65, 87, 124, 51, 69, 105, 185, 208, 249, 109, 134, 174, 25, 53, 93, 110, 144, 190, 150, 176, 213, 35,
				55, 106, 95, 122, 165, 152, 184, 223, 31, 54, 108, 49, 76, 123, 175, 203, 240, 83, 103, 153, 28, 62, 100, 102, 100, 140, 197, 174,
				184, 210, 185, 189, 200, 180, 181, 202, 178, 174, 215, 183, 196, 205, 179, 180, 209, 180, 184, 209, 180, 184, 209, 180, 184, 209, 180,
				184, 209, 180, 184, 209, 180, 185, 209, 180, 185, 209, 180, 185, 209, 180, 184, 209, 180, 184, 209, 180, 184, 209, 180, 184, 209, 180,
				184, 209, 180, 184, 209, 180, 184, 209, 180, 184, 27, 65, 128, 163, 194, 225, 141, 166, 207, 22, 51, 93, 112, 134, 171, 176, 194, 230,
				46, 69, 110, 83, 108, 148, 171, 199, 239, 35, 69, 115, 59, 85, 122, 195, 215, 255, 105, 132, 175, 24, 56, 95, 161, 184, 238, 131, 158,
				205, 31, 59, 96, 117, 137, 187, 186, 220, 255, 137, 135, 175, 255, 233, 243, 255, 247, 251, 255, 249, 250, 255, 248, 244, 255, 242,
				255, 255, 247, 248, 255, 246, 250, 255, 246, 250, 255, 246, 250, 255, 246, 250, 255, 246, 250, 255, 246, 251, 255, 246, 251, 255, 246,
				251, 255, 246, 250, 255, 246, 250, 255, 246, 250, 255, 246, 250, 255, 246, 250, 255, 246, 250, 255, 246, 250, 255, 246, 250, 23, 54,
				134, 113, 136, 177, 101, 123, 173, 120, 123, 156, 95, 108, 150, 128, 146, 194, 150, 151, 182, 84, 96, 136, 116, 145, 201, 73, 88, 131,
				123, 129, 153, 126, 153, 196, 114, 129, 160, 124, 134, 161, 90, 118, 165, 94, 114, 151, 163, 165, 188, 95, 114, 154, 123, 145, 182,
				128, 102, 147, 255, 154, 192, 255, 158, 196, 255, 163, 198, 255, 154, 186, 255, 166, 204, 255, 170, 200, 255, 163, 196, 255, 163, 196,
				255, 163, 196, 255, 163, 197, 255, 163, 197, 255, 163, 197, 255, 163, 199, 255, 163, 199, 255, 166, 197, 255, 166, 197, 255, 166, 197,
				255, 166, 197, 255, 166, 197, 255, 166, 197, 255, 166, 197, 255, 166, 197, 19, 50, 130, 40, 63, 104, 59, 81, 131, 229, 232, 255, 79,
				92, 134, 51, 69, 117, 230, 231, 255, 128, 140, 180, 30, 59, 115, 125, 140, 183, 188, 194, 218, 47, 74, 117, 122, 137, 168, 200, 210,
				237, 34, 62, 109, 58, 78, 115, 235, 237, 255, 109, 128, 168, 41, 63, 100, 75, 49, 94, 141, 29, 67, 136, 17, 55, 141, 25, 60, 142, 17,
				49, 124, 26, 64, 126, 19, 49, 135, 21, 54, 135, 21, 54, 135, 21, 54, 135, 21, 55, 135, 21, 55, 135, 21, 55, 135, 21, 57, 135, 21, 57,
				129, 24, 55, 129, 24, 55, 129, 24, 55, 129, 24, 55, 129, 24, 55, 129, 24, 55, 129, 24, 55, 129, 24, 55, 28, 58, 128, 161, 183, 207,
				115, 139, 183, 37, 69, 118, 114, 136, 177, 159, 175, 211, 49, 77, 124, 87, 114, 161, 163, 187, 231, 36, 73, 128, 53, 79, 128, 181,
				202, 231, 93, 124, 171, 26, 60, 121, 147, 173, 210, 113, 140, 185, 34, 64, 124, 114, 134, 171, 182, 205, 239, 88, 82, 118, 150, 106,
				123, 162, 114, 130, 158, 105, 123, 175, 111, 127, 157, 101, 128, 170, 118, 131, 162, 110, 123, 162, 110, 123, 162, 110, 123, 162, 109,
				125, 162, 109, 125, 162, 109, 127, 162, 109, 127, 162, 109, 127, 166, 107, 125, 166, 107, 125, 166, 107, 125, 166, 107, 125, 166, 107,
				125, 166, 107, 125, 166, 107, 125, 166, 107, 125, 22, 52, 122, 99, 121, 145, 76, 100, 144, 63, 95, 144, 92, 114, 155, 98, 114, 150,
				86, 114, 161, 45, 72, 119, 100, 124, 168, 28, 65, 120, 63, 89, 138, 102, 123, 152, 68, 99, 146, 54, 88, 149, 75, 101, 138, 70, 97,
				142, 86, 116, 176, 68, 88, 125, 87, 110, 144, 132, 126, 162, 255, 226, 243, 255, 234, 250, 255, 233, 251, 255, 228, 244, 255, 235,
				255, 255, 229, 242, 255, 233, 246, 255, 233, 246, 255, 233, 246, 255, 232, 248, 255, 232, 248, 255, 232, 250, 255, 232, 250, 255, 232,
				250, 255, 230, 248, 255, 230, 248, 255, 230, 248, 255, 230, 248, 255, 230, 248, 255, 230, 248, 255, 230, 248, 255, 230, 248, 35, 54,
				110, 70, 77, 121, 69, 87, 123, 197, 215, 251, 77, 95, 131, 68, 86, 122, 191, 209, 245, 119, 137, 173, 63, 81, 117, 127, 145, 181, 163,
				182, 212, 81, 100, 130, 120, 139, 169, 186, 205, 235, 59, 78, 108, 86, 105, 135, 200, 219, 249, 107, 126, 156, 67, 92, 122, 127, 124,
				153, 255, 219, 243, 255, 221, 236, 255, 223, 230, 255, 223, 226, 255, 224, 230, 255, 220, 231, 255, 223, 231, 255, 223, 231, 255, 223,
				231, 255, 223, 231, 255, 223, 231, 255, 223, 231, 255, 223, 231, 255, 223, 231, 255, 223, 231, 255, 223, 231, 255, 223, 231, 255, 223,
				231, 255, 223, 231, 255, 223, 231, 255, 223, 231, 255, 223, 231, 45, 64, 120, 195, 202, 246, 174, 192, 228, 66, 84, 120, 126, 144,
				180, 195, 213, 249, 71, 89, 125, 102, 120, 156, 208, 226, 255, 62, 80, 116, 66, 85, 115, 226, 245, 255, 151, 170, 200, 58, 77, 107,
				172, 191, 221, 146, 165, 195, 61, 80, 110, 128, 147, 177, 214, 239, 255, 86, 83, 112, 136, 96, 120, 170, 109, 124, 160, 99, 106, 164,
				108, 111, 164, 111, 117, 162, 106, 117, 160, 107, 115, 160, 107, 115, 160, 107, 115, 160, 107, 115, 160, 107, 115, 160, 107, 115, 160,
				107, 115, 160, 107, 115, 160, 107, 115, 160, 107, 115, 160, 107, 115, 160, 107, 115, 160, 107, 115, 160, 107, 115, 160, 107, 115, 160,
				107, 115, 44, 67, 101, 83, 121, 132, 106, 123, 151, 55, 72, 100, 80, 97, 125, 107, 124, 152, 53, 70, 98, 69, 86, 114, 115, 132, 160,
				52, 69, 97, 60, 75, 108, 98, 113, 146, 99, 114, 147, 52, 67, 100, 90, 105, 138, 86, 101, 134, 60, 75, 108, 76, 91, 124, 105, 125, 149,
				81, 68, 96, 113, 56, 88, 138, 51, 83, 148, 51, 82, 141, 48, 77, 135, 46, 78, 138, 48, 84, 142, 50, 75, 142, 50, 75, 142, 50, 75, 142,
				50, 75, 142, 50, 75, 142, 50, 75, 142, 50, 75, 142, 50, 75, 142, 50, 75, 142, 50, 75, 142, 50, 75, 142, 50, 75, 142, 50, 75, 142, 50,
				75, 142, 50, 75, 142, 50, 75, 201, 224, 255, 189, 227, 238, 201, 218, 246, 206, 223, 251, 199, 216, 244, 200, 217, 245, 206, 223, 251,
				203, 220, 248, 202, 219, 247, 204, 221, 249, 203, 218, 251, 204, 219, 252, 201, 216, 249, 205, 220, 253, 204, 219, 252, 203, 218, 251,
				202, 217, 250, 206, 221, 254, 200, 220, 244, 233, 220, 248, 252, 195, 227, 255, 185, 217, 255, 187, 218, 255, 187, 216, 255, 191, 223,
				255, 187, 223, 255, 189, 214, 255, 189, 214, 255, 189, 214, 255, 189, 214, 255, 189, 214, 255, 189, 214, 255, 189, 214, 255, 189, 214,
				255, 189, 214, 255, 189, 214, 255, 189, 214, 255, 189, 214, 255, 189, 214, 255, 189, 214, 255, 189, 214, 255, 189, 214, 255, 244, 255,
				255, 231, 247, 255, 241, 250, 255, 243, 252, 255, 241, 250, 255, 244, 253, 255, 242, 251, 255, 239, 248, 255, 244, 253, 255, 240, 249,
				255, 239, 246, 255, 244, 251, 255, 238, 245, 255, 244, 251, 255, 236, 243, 255, 244, 251, 255, 244, 251, 255, 235, 242, 255, 240, 247,
				255, 229, 237, 255, 241, 246, 255, 243, 244, 255, 241, 239, 255, 244, 243, 255, 238, 243, 255, 242, 251, 255, 242, 251, 255, 242, 251,
				255, 242, 251, 255, 242, 251, 255, 242, 251, 255, 242, 251, 255, 242, 251, 255, 242, 251, 255, 242, 251, 255, 242, 251, 255, 242, 251,
				255, 242, 251, 255, 242, 251, 255, 242, 251, 255, 242, 251, 255, 242, 251, 170, 146, 168, 201, 148, 164, 184, 151, 160, 189, 156, 165,
				183, 150, 159, 185, 152, 161, 186, 153, 162, 181, 148, 157, 186, 153, 162, 184, 151, 160, 189, 154, 161, 184, 149, 156, 183, 148, 155,
				185, 150, 157, 187, 152, 159, 187, 152, 159, 185, 150, 157, 191, 156, 163, 187, 154, 161, 196, 156, 164, 193, 148, 153, 185, 145, 146,
				185, 154, 152, 186, 160, 159, 183, 151, 156, 184, 144, 153, 184, 151, 160, 184, 151, 160, 184, 151, 160, 184, 151, 160, 184, 151, 160,
				184, 151, 160, 184, 151, 160, 184, 151, 160, 184, 151, 160, 184, 151, 160, 184, 151, 160, 184, 151, 160, 184, 151, 160, 184, 151, 160,
				184, 151, 160, 184, 151, 160, 146, 21, 61, 141, 18, 47, 140, 22, 56, 131, 13, 47, 137, 19, 53, 140, 22, 56, 132, 14, 48, 136, 18, 52,
				143, 25, 59, 135, 17, 51, 139, 22, 51, 131, 14, 43, 144, 27, 56, 141, 24, 53, 140, 23, 52, 139, 22, 51, 138, 21, 50, 132, 15, 44, 133,
				15, 47, 145, 21, 57, 143, 14, 53, 146, 19, 60, 137, 18, 58, 124, 12, 50, 142, 30, 70, 135, 20, 61, 135, 21, 55, 135, 21, 55, 135, 21,
				55, 135, 21, 55, 135, 21, 55, 135, 21, 55, 135, 21, 55, 135, 21, 55, 135, 21, 55, 135, 21, 55, 135, 21, 55, 135, 21, 55, 135, 21, 55,
				135, 21, 55, 135, 21, 55, 135, 21, 55, 255, 138, 178, 255, 146, 175, 255, 147, 181, 255, 143, 177, 255, 148, 182, 255, 143, 177, 255,
				146, 180, 255, 150, 184, 255, 141, 175, 255, 146, 180, 255, 147, 176, 255, 146, 175, 255, 143, 172, 255, 147, 176, 255, 143, 172, 255,
				142, 171, 255, 151, 180, 255, 146, 175, 255, 145, 177, 255, 144, 180, 255, 145, 184, 255, 132, 173, 255, 149, 189, 255, 152, 190, 251,
				139, 179, 255, 147, 188, 255, 146, 180, 255, 146, 180, 255, 146, 180, 255, 146, 180, 255, 146, 180, 255, 146, 180, 255, 146, 180, 255,
				146, 180, 255, 146, 180, 255, 146, 180, 255, 146, 180, 255, 146, 180, 255, 146, 180, 255, 146, 180, 255, 146, 180, 255, 146, 180, 254,
				255, 247, 255, 253, 250, 255, 255, 250, 255, 255, 250, 255, 255, 250, 255, 255, 250, 255, 255, 250, 255, 255, 250, 255, 255, 250, 255,
				255, 250, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 255, 253, 255, 249,
				255, 250, 251, 255, 250, 254, 255, 253, 255, 255, 253, 255, 255, 253, 255, 253, 253, 255, 252, 251, 255, 250, 250, 255, 252, 250, 255,
				252, 250, 255, 252, 250, 255, 252, 250, 255, 252, 250, 255, 252, 250, 255, 252, 250, 255, 252, 250, 255, 252, 250, 255, 252, 250, 255,
				252, 250, 255, 252, 250, 255, 252, 250, 255, 252, 250, 255, 252, 250, 255, 252, 250, 233, 234, 226, 241, 233, 230, 237, 234, 229, 237,
				234, 229, 237, 234, 229, 237, 234, 229, 237, 234, 229, 237, 234, 229, 237, 234, 229, 237, 234, 229, 238, 232, 236, 238, 232, 236, 238,
				232, 236, 238, 232, 236, 238, 232, 236, 238, 232, 236, 238, 232, 236, 238, 232, 236, 228, 238, 229, 230, 237, 229, 233, 235, 232, 234,
				234, 232, 235, 234, 232, 238, 232, 232, 241, 231, 230, 245, 229, 229, 241, 231, 229, 241, 231, 229, 241, 231, 229, 241, 231, 229, 241,
				231, 229, 241, 231, 229, 241, 231, 229, 241, 231, 229, 241, 231, 229, 241, 231, 229, 241, 231, 229, 241, 231, 229, 241, 231, 229, 241,
				231, 229, 241, 231, 229, 241, 231, 229, 171, 11, 55, 148, 8, 57, 156, 10, 47, 156, 10, 47, 156, 10, 47, 156, 10, 47, 156, 10, 47, 156,
				10, 47, 156, 10, 47, 156, 10, 47, 158, 9, 51, 158, 9, 51, 158, 9, 51, 158, 9, 51, 158, 9, 51, 158, 9, 51, 158, 9, 51, 158, 9, 51, 170,
				3, 49, 165, 5, 49, 156, 10, 49, 149, 13, 49, 148, 14, 47, 152, 13, 46, 158, 10, 44, 162, 8, 44, 153, 11, 51, 153, 11, 51, 153, 11, 51,
				153, 11, 51, 153, 11, 51, 153, 11, 51, 153, 11, 51, 153, 11, 51, 153, 11, 51, 153, 11, 51, 153, 11, 51, 153, 11, 51, 153, 11, 51, 153,
				11, 51, 153, 11, 51, 153, 11, 51, 215, 55, 99, 200, 60, 109, 207, 61, 98, 207, 61, 98, 207, 61, 98, 207, 61, 98, 207, 61, 98, 207, 61,
				98, 207, 61, 98, 207, 61, 98, 209, 60, 102, 209, 60, 102, 209, 60, 102, 209, 60, 102, 209, 60, 102, 209, 60, 102, 209, 60, 102, 209,
				60, 102, 221, 54, 100, 216, 56, 100, 207, 61, 100, 200, 64, 100, 199, 65, 98, 203, 64, 97, 209, 61, 95, 213, 59, 95, 204, 62, 102,
				204, 62, 102, 204, 62, 102, 204, 62, 102, 204, 62, 102, 204, 62, 102, 204, 62, 102, 204, 62, 102, 204, 62, 102, 204, 62, 102, 204, 62,
				102, 204, 62, 102, 204, 62, 102, 204, 62, 102, 204, 62, 102, 204, 62, 102, 255, 252, 240, 247, 255, 255, 249, 255, 255, 249, 255, 255,
				249, 255, 255, 249, 255, 255, 249, 255, 255, 249, 255, 255, 249, 255, 255, 249, 255, 255, 249, 255, 251, 249, 255, 251, 249, 255, 251,
				249, 255, 251, 249, 255, 251, 249, 255, 251, 249, 255, 251, 249, 255, 251, 251, 255, 255, 252, 255, 255, 255, 254, 255, 255, 251, 255,
				255, 251, 255, 255, 252, 255, 254, 255, 255, 248, 255, 255, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251,
				255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251,
				255, 255, 251, 255, 255, 251, 255, 253, 241, 247, 255, 255, 249, 255, 255, 249, 255, 255, 249, 255, 255, 249, 255, 255, 249, 255, 255,
				249, 255, 255, 249, 255, 255, 249, 255, 255, 249, 255, 251, 249, 255, 251, 249, 255, 251, 249, 255, 251, 249, 255, 251, 249, 255, 251,
				249, 255, 251, 249, 255, 251, 251, 255, 255, 252, 255, 255, 255, 254, 255, 255, 251, 255, 255, 251, 255, 255, 252, 255, 254, 255, 255,
				248, 255, 255, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251,
				255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 255, 255, 251, 186, 7, 46,
				174, 0, 58, 180, 0, 54, 180, 0, 54, 180, 0, 54, 180, 0, 54, 180, 0, 54, 180, 0, 54, 180, 0, 54, 180, 0, 54, 180, 0, 55, 180, 0, 55,
				180, 0, 55, 180, 0, 55, 180, 0, 55, 180, 0, 55, 180, 0, 55, 180, 0, 55, 177, 0, 55, 174, 1, 54, 174, 2, 52, 175, 1, 50, 177, 0, 52,
				178, 0, 54, 175, 0, 57, 173, 1, 59, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57,
				175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57, 173, 0, 33, 180, 2, 64, 180, 0, 54,
				180, 0, 54, 180, 0, 54, 180, 0, 54, 180, 0, 54, 180, 0, 54, 180, 0, 54, 180, 0, 54, 180, 0, 55, 180, 0, 55, 180, 0, 55, 180, 0, 55,
				180, 0, 55, 180, 0, 55, 180, 0, 55, 180, 0, 55, 177, 0, 55, 174, 1, 54, 174, 2, 52, 175, 1, 50, 177, 0, 52, 178, 0, 54, 175, 0, 57,
				173, 1, 59, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57,
				175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57, 175, 0, 57,
			]
		),
	},
]

nameGlyphs = [
	{ c: "!", data: ImageHelper.fromJsonBinarized(4, 43, [52, 48, 1, 3, 1, 3, 8, 12]) },
	{ c: '"', data: ImageHelper.fromJsonBinarized(7, 43, [98, 3, 1, 6, 1, 6, 1, 6, 1, 6, 1, 3, 1, 2, 1, 3]) },
	{
		c: "#",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				200, 2, 4, 2, 5, 3, 3, 3, 5, 3, 3, 3, 3, 13, 1, 13, 1, 13, 3, 2, 4, 2, 6, 2, 4, 2, 6, 2, 3, 3, 5, 3, 3, 3, 5, 3, 3, 3, 3, 13, 1, 13,
				3, 3, 3, 3, 5, 2, 4, 2, 6, 2, 4, 2, 6, 2, 4, 2,
			]
		),
	},
	{
		c: "$",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				199, 2, 13, 3, 9, 11, 4, 13, 3, 4, 1, 3, 2, 4, 1, 3, 4, 2, 3, 3, 1, 3, 4, 2, 4, 2, 1, 3, 4, 2, 8, 3, 3, 2, 8, 10, 7, 12, 8, 9, 8, 2,
				3, 4, 7, 2, 4, 6, 4, 2, 4, 6, 4, 2, 4, 3, 1, 3, 3, 2, 3, 4, 1, 14, 3, 12, 8, 4, 13, 2, 14, 2,
			]
		),
	},
	{
		c: "&",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				225, 6, 9, 11, 5, 13, 4, 3, 7, 3, 4, 3, 7, 3, 4, 3, 7, 3, 4, 3, 7, 3, 5, 3, 3, 6, 5, 11, 5, 8, 8, 8, 9, 3, 3, 4, 3, 3, 1, 2, 5, 4, 2,
				3, 1, 2, 6, 4, 1, 3, 1, 3, 6, 7, 1, 3, 7, 6, 1, 16, 2, 16, 3, 8,
			]
		),
	},
	{ c: "'", data: ImageHelper.fromJsonBinarized(3, 43, [39, 20]) },
	{
		c: "(",
		data: ImageHelper.fromJsonBinarized(
			6,
			43,
			[81, 3, 3, 3, 2, 3, 2, 4, 2, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 3, 3, 3, 3, 3, 4, 3, 3, 3, 4, 3]
		),
	},
	{
		c: ")",
		data: ImageHelper.fromJsonBinarized(
			6,
			43,
			[78, 3, 3, 4, 3, 3, 4, 3, 3, 3, 3, 3, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 3, 3, 3, 2, 4, 2, 3, 2, 3]
		),
	},
	{ c: "*", data: ImageHelper.fromJsonBinarized(9, 43, [129, 2, 5, 1, 1, 2, 2, 1, 1, 9, 1, 7, 3, 5, 2, 11, 1, 2, 1, 2, 4, 2, 7, 2]) },
	{ c: "+", data: ImageHelper.fromJsonBinarized(13, 43, [239, 3, 10, 3, 10, 3, 10, 3, 10, 3, 5, 39, 5, 3, 10, 3, 10, 3, 10, 3, 10, 3]) },
	{ c: ",", data: ImageHelper.fromJsonBinarized(4, 43, [112, 12, 2, 2, 2, 9]) },
	{ c: "-", data: ImageHelper.fromJsonBinarized(8, 43, [184, 24]) },
	{ c: ".", data: ImageHelper.fromJsonBinarized(4, 43, [112, 16]) },
	{
		c: "/",
		data: ImageHelper.fromJsonBinarized(
			9,
			43,
			[132, 3, 6, 3, 5, 3, 6, 3, 6, 2, 6, 3, 6, 3, 5, 3, 6, 3, 6, 2, 6, 3, 6, 3, 5, 3, 6, 3, 6, 2, 6, 3, 6, 3]
		),
	},
	{
		c: "0",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				212, 8, 6, 12, 3, 14, 2, 4, 6, 4, 2, 3, 8, 8, 8, 8, 9, 6, 10, 6, 10, 6, 10, 6, 10, 6, 10, 7, 9, 7, 8, 4, 1, 3, 8, 4, 1, 4, 6, 4, 2,
				14, 3, 12, 6, 8,
			]
		),
	},
	{
		c: "1",
		data: ImageHelper.fromJsonBinarized(
			7,
			43,
			[98, 6, 1, 14, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3]
		),
	},
	{
		c: "2",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[212, 8, 6, 12, 3, 14, 1, 15, 1, 4, 8, 8, 8, 8, 8, 4, 12, 3, 11, 5, 6, 10, 3, 12, 3, 10, 6, 5, 10, 4, 12, 3, 13, 15, 1, 15, 1, 15, 1, 15]
		),
	},
	{
		c: "3",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				212, 8, 6, 12, 3, 14, 1, 5, 6, 4, 1, 4, 8, 3, 1, 3, 9, 3, 13, 3, 12, 4, 5, 10, 6, 10, 6, 11, 13, 3, 13, 3, 1, 3, 9, 7, 9, 8, 7, 4, 1,
				15, 2, 13, 5, 9,
			]
		),
	},
	{
		c: "3",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				214, 6, 6, 13, 3, 13, 2, 5, 6, 4, 1, 3, 9, 3, 1, 3, 9, 3, 13, 3, 12, 4, 4, 11, 5, 10, 6, 12, 13, 3, 13, 7, 9, 7, 9, 3, 1, 4, 7, 4, 1,
				15, 2, 13, 5, 9,
			]
		),
	},
	{
		c: "4",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				231, 4, 13, 4, 12, 5, 11, 6, 10, 7, 9, 4, 1, 3, 8, 4, 2, 3, 7, 4, 3, 3, 6, 4, 4, 3, 5, 4, 5, 3, 4, 4, 6, 3, 4, 3, 7, 3, 3, 51, 11, 3,
				14, 3, 14, 3, 14, 3,
			]
		),
	},
	{
		c: "5",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[210, 14, 1, 14, 1, 14, 1, 3, 12, 3, 12, 3, 12, 3, 1, 9, 2, 14, 1, 6, 3, 9, 9, 3, 12, 3, 12, 6, 9, 6, 9, 7, 7, 4, 1, 13, 2, 13, 5, 7]
		),
	},
	{
		c: "6",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				213, 7, 6, 12, 3, 14, 2, 4, 6, 4, 2, 3, 8, 8, 9, 2, 1, 3, 13, 3, 2, 8, 3, 15, 1, 15, 1, 4, 8, 8, 9, 6, 10, 6, 10, 3, 1, 2, 10, 3, 1,
				3, 8, 4, 1, 14, 3, 13, 5, 8,
			]
		),
	},
	{
		c: "7",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[224, 32, 1, 15, 12, 3, 12, 4, 11, 4, 11, 4, 12, 3, 12, 4, 11, 4, 12, 3, 12, 4, 11, 4, 11, 4, 12, 3, 12, 4, 11, 4]
		),
	},
	{
		c: "8",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				225, 9, 6, 13, 3, 15, 2, 5, 6, 4, 2, 3, 9, 3, 2, 3, 9, 3, 2, 3, 9, 3, 2, 4, 7, 4, 3, 13, 5, 12, 3, 15, 2, 3, 9, 8, 10, 7, 10, 7, 10,
				3, 1, 4, 8, 4, 1, 15, 3, 14, 4, 11,
			]
		),
	},
	{
		c: "9",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				214, 5, 7, 12, 3, 14, 2, 4, 6, 4, 2, 3, 9, 6, 10, 6, 10, 6, 10, 3, 1, 3, 9, 3, 1, 5, 5, 5, 1, 15, 2, 10, 1, 3, 13, 3, 13, 3, 1, 3, 9,
				3, 1, 3, 8, 3, 2, 14, 3, 12, 6, 8,
			]
		),
	},
	{ c: ":", data: ImageHelper.fromJsonBinarized(4, 43, [73, 3, 1, 7, 1, 3, 25, 3, 1, 3, 1, 3]) },
	{ c: ";", data: ImageHelper.fromJsonBinarized(4, 43, [72, 16, 24, 12, 2, 2, 1, 6, 1, 2]) },
	{ c: "<", data: ImageHelper.fromJsonBinarized(12, 43, [227, 1, 9, 3, 7, 5, 5, 6, 4, 6, 4, 5, 6, 4, 8, 4, 9, 5, 9, 6, 8, 6, 8, 5, 9, 3, 11, 1]) },
	{ c: "=", data: ImageHelper.fromJsonBinarized(14, 43, [294, 41, 29, 41]) },
	{ c: ">", data: ImageHelper.fromJsonBinarized(12, 43, [216, 1, 11, 3, 9, 5, 8, 6, 8, 6, 9, 5, 9, 4, 8, 4, 6, 5, 4, 6, 4, 6, 5, 5, 7, 3, 9, 1]) },
	{
		c: "?",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[212, 8, 5, 14, 2, 20, 7, 7, 10, 6, 10, 6, 10, 4, 1, 1, 9, 4, 10, 6, 7, 8, 7, 6, 10, 4, 12, 3, 13, 3, 29, 3, 12, 5, 11, 5]
		),
	},
	{
		c: "Av",
		data: ImageHelper.fromJsonBinarized(
			29,
			43,
			[
				413, 4, 24, 5, 24, 5, 23, 7, 22, 3, 2, 2, 4, 3, 8, 2, 5, 2, 3, 3, 3, 3, 8, 2, 4, 3, 3, 3, 4, 3, 6, 3, 4, 3, 4, 2, 4, 3, 6, 3, 3, 3, 5,
				3, 4, 3, 4, 3, 4, 3, 6, 2, 4, 3, 4, 3, 3, 4, 6, 3, 3, 3, 4, 2, 4, 13, 4, 3, 2, 3, 4, 14, 3, 3, 2, 3, 3, 15, 4, 6, 4, 3, 9, 4, 3, 6, 3,
				4, 10, 3, 3, 5, 4, 3, 11, 3, 4, 4,
			]
		),
	},
	{
		c: "A",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				259, 4, 13, 5, 13, 6, 11, 7, 11, 3, 1, 4, 10, 3, 2, 3, 9, 3, 3, 4, 8, 3, 4, 3, 7, 4, 4, 3, 7, 3, 5, 4, 5, 4, 6, 3, 5, 14, 4, 14, 3,
				15, 3, 3, 9, 4, 1, 4, 10, 3, 1, 3, 11, 4, 1, 2, 12, 3,
			]
		),
	},
	{
		c: "AY",
		data: ImageHelper.fromJsonBinarized(
			32,
			43,
			[
				455, 4, 4, 4, 9, 4, 6, 6, 4, 3, 9, 3, 7, 6, 4, 4, 7, 4, 7, 6, 5, 4, 6, 3, 7, 3, 2, 3, 5, 3, 5, 4, 7, 3, 2, 3, 5, 4, 3, 4, 7, 4, 2, 4,
				5, 3, 3, 3, 8, 3, 4, 3, 5, 4, 1, 4, 7, 4, 4, 3, 6, 7, 8, 3, 6, 3, 6, 5, 9, 3, 6, 3, 6, 5, 8, 14, 6, 3, 9, 14, 6, 3, 8, 16, 5, 3, 8, 3,
				9, 4, 5, 3, 8, 3, 10, 3, 5, 3, 7, 4, 10, 4, 4, 3,
			]
		),
	},
	{
		c: "B",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[210, 13, 2, 14, 1, 18, 8, 7, 8, 7, 8, 7, 8, 3, 1, 14, 1, 13, 2, 18, 9, 6, 9, 6, 9, 6, 9, 6, 8, 33, 1, 11]
		),
	},
	{
		c: "B",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[210, 13, 2, 14, 1, 18, 8, 7, 8, 7, 8, 7, 8, 3, 1, 14, 1, 13, 2, 18, 9, 6, 9, 6, 9, 6, 9, 6, 8, 33, 1, 11]
		),
	},
	{
		c: "C",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				226, 7, 7, 13, 3, 15, 2, 6, 4, 10, 9, 8, 10, 7, 10, 6, 14, 3, 14, 3, 14, 3, 14, 3, 11, 6, 11, 7, 10, 7, 9, 4, 1, 4, 7, 5, 1, 15, 3,
				13, 6, 9,
			]
		),
	},
	{
		c: "D",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				239, 12, 4, 15, 2, 4, 6, 5, 2, 3, 9, 4, 1, 3, 10, 3, 1, 3, 10, 3, 1, 3, 11, 6, 11, 6, 11, 6, 11, 6, 11, 2, 1, 3, 11, 2, 1, 3, 10, 3,
				1, 3, 10, 3, 1, 3, 9, 3, 2, 15, 3, 12,
			]
		),
	},
	{
		c: "D",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				238, 14, 3, 15, 2, 16, 1, 3, 9, 4, 1, 3, 9, 4, 1, 3, 10, 3, 1, 3, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 9, 4, 1, 3, 9, 4, 1, 16,
				1, 15, 2, 14, 3, 12,
			]
		),
	},
	{
		c: "E",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[210, 49, 11, 4, 11, 4, 11, 4, 11, 14, 1, 14, 1, 14, 1, 4, 11, 4, 11, 4, 11, 4, 11, 4, 11, 30, 1, 14]
		),
	},
	{
		c: "E",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[210, 49, 11, 4, 11, 4, 11, 4, 11, 14, 1, 14, 1, 14, 1, 4, 11, 4, 11, 4, 11, 4, 11, 5, 10, 30, 1, 14]
		),
	},
	{
		c: "F",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[210, 49, 11, 4, 11, 4, 11, 4, 11, 14, 1, 14, 1, 14, 1, 4, 11, 4, 11, 4, 11, 4, 11, 4, 11, 4, 11, 4, 12, 2]
		),
	},
	{
		c: "G",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				240, 6, 9, 12, 5, 14, 3, 5, 7, 4, 2, 3, 10, 3, 2, 3, 10, 4, 1, 3, 10, 4, 1, 3, 14, 4, 14, 4, 4, 14, 4, 14, 10, 4, 1, 3, 10, 4, 1, 3,
				10, 4, 1, 3, 10, 4, 1, 4, 8, 4, 3, 15, 3, 14, 6, 10,
			]
		),
	},
	{
		c: "H",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[224, 3, 10, 6, 10, 6, 10, 6, 10, 6, 10, 6, 10, 6, 10, 54, 10, 6, 10, 6, 10, 6, 10, 6, 10, 6, 10, 6, 10, 6, 10, 3]
		),
	},
	{
		c: "H",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[238, 3, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 8, 9, 58, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 11, 2]
		),
	},
	{
		c: "ITA",
		data: ImageHelper.fromJsonBinarized(
			37,
			43,
			[
				518, 3, 2, 17, 4, 5, 6, 3, 2, 17, 4, 5, 6, 3, 2, 17, 4, 6, 5, 3, 9, 3, 10, 7, 5, 3, 9, 3, 10, 3, 1, 3, 5, 3, 9, 3, 9, 3, 3, 3, 4, 3,
				9, 3, 9, 3, 3, 3, 4, 3, 9, 3, 8, 4, 3, 4, 3, 3, 9, 3, 8, 3, 5, 3, 3, 3, 9, 3, 8, 3, 5, 3, 3, 3, 9, 3, 7, 3, 7, 3, 2, 3, 9, 3, 7, 13,
				2, 3, 9, 3, 6, 15, 1, 3, 9, 3, 6, 15, 1, 3, 9, 3, 5, 4, 9, 3, 1, 3, 9, 3, 5, 4, 10, 6, 9, 3, 5, 3, 11, 3,
			]
		),
	},
	{
		c: "J",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				222, 3, 12, 3, 12, 3, 12, 3, 12, 3, 12, 3, 12, 3, 12, 3, 12, 3, 12, 3, 1, 3, 8, 7, 8, 7, 8, 3, 1, 3, 8, 3, 1, 4, 6, 4, 1, 14, 2, 12,
				5, 8,
			]
		),
	},
	{
		c: "K",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				195, 3, 7, 4, 1, 3, 6, 5, 1, 3, 5, 5, 2, 3, 5, 4, 3, 3, 4, 4, 4, 3, 3, 4, 5, 3, 2, 4, 6, 3, 1, 4, 7, 7, 8, 7, 8, 3, 1, 4, 7, 3, 2, 4,
				6, 3, 3, 4, 5, 3, 4, 4, 4, 3, 5, 4, 3, 3, 5, 5, 2, 3, 6, 5, 1, 3, 7, 8, 8, 4,
			]
		),
	},
	{
		c: "L",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[196, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 6, 8, 42]
		),
	},
	{
		c: "L",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[210, 4, 11, 4, 11, 4, 11, 4, 11, 4, 11, 4, 11, 4, 11, 4, 11, 4, 11, 4, 11, 4, 11, 4, 11, 4, 11, 4, 11, 4, 11, 32, 1, 12]
		),
	},
	{
		c: "L",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[196, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 6, 8, 42]
		),
	},
	{
		c: "M",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				266, 5, 8, 11, 8, 12, 7, 12, 6, 13, 6, 3, 1, 10, 5, 3, 1, 6, 1, 3, 4, 4, 1, 6, 1, 3, 4, 4, 1, 6, 1, 4, 3, 3, 2, 6, 2, 3, 3, 3, 2, 6,
				2, 3, 2, 4, 2, 6, 2, 4, 1, 3, 3, 6, 3, 3, 1, 3, 3, 6, 3, 7, 3, 6, 3, 6, 4, 6, 4, 5, 4, 6, 4, 4, 4, 7, 4, 4, 5, 3,
			]
		),
	},
	{
		c: "N",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				224, 5, 8, 8, 8, 9, 7, 10, 6, 6, 1, 3, 6, 6, 1, 4, 5, 6, 2, 3, 5, 6, 2, 4, 4, 6, 3, 4, 3, 6, 3, 4, 3, 6, 4, 4, 2, 6, 5, 3, 2, 6, 5, 4,
				1, 6, 6, 3, 1, 6, 6, 10, 7, 9, 8, 8, 8, 5,
			]
		),
	},
	{
		c: "N",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				211, 1, 12, 5, 8, 9, 7, 9, 7, 10, 6, 6, 1, 3, 6, 6, 1, 4, 5, 6, 2, 4, 4, 6, 2, 4, 4, 6, 3, 4, 3, 6, 3, 4, 3, 6, 4, 4, 2, 6, 5, 3, 2,
				6, 5, 4, 1, 6, 6, 10, 6, 10, 7, 9, 8, 8, 8, 5,
			]
		),
	},
	{
		c: "O",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				240, 7, 8, 13, 4, 15, 2, 5, 6, 5, 2, 4, 9, 4, 1, 3, 10, 4, 1, 3, 11, 3, 1, 3, 11, 3, 1, 3, 11, 7, 11, 3, 1, 3, 11, 3, 1, 3, 11, 3, 1,
				3, 11, 3, 1, 3, 11, 3, 1, 4, 9, 4, 1, 5, 7, 4, 3, 15, 3, 14, 6, 10,
			]
		),
	},
	{
		c: "O",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				240, 7, 8, 13, 4, 15, 2, 6, 5, 5, 2, 4, 9, 4, 1, 3, 10, 4, 1, 3, 11, 3, 1, 3, 11, 3, 1, 3, 11, 7, 11, 7, 11, 3, 1, 3, 11, 3, 1, 3, 11,
				3, 1, 3, 10, 4, 1, 4, 9, 4, 1, 5, 7, 5, 2, 15, 3, 14, 6, 10,
			]
		),
	},
	{
		c: "O",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				226, 8, 6, 13, 3, 15, 2, 5, 6, 9, 9, 8, 10, 6, 11, 6, 11, 6, 11, 6, 11, 6, 11, 6, 11, 6, 11, 6, 11, 7, 9, 4, 1, 4, 7, 5, 1, 15, 3, 13,
				6, 9,
			]
		),
	},
	{
		c: "P",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				224, 14, 2, 15, 1, 15, 1, 3, 9, 3, 1, 3, 9, 3, 1, 3, 9, 7, 9, 7, 8, 4, 1, 15, 1, 15, 1, 13, 3, 3, 13, 3, 13, 3, 13, 3, 13, 3, 13, 3,
				13, 3,
			]
		),
	},
	{
		c: "P",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[210, 14, 1, 33, 9, 6, 9, 6, 9, 6, 9, 6, 8, 33, 1, 13, 2, 3, 12, 3, 12, 3, 12, 3, 12, 3, 12, 3, 12, 3]
		),
	},
	{
		c: "Q",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				240, 6, 9, 13, 4, 15, 2, 5, 6, 5, 2, 4, 9, 3, 2, 3, 10, 4, 1, 3, 11, 3, 1, 3, 11, 7, 11, 7, 11, 3, 1, 3, 11, 3, 1, 3, 11, 3, 1, 3, 11,
				3, 1, 3, 4, 3, 4, 3, 1, 3, 5, 3, 2, 3, 2, 4, 5, 7, 3, 15, 3, 14, 7, 11, 15, 3, 15, 4,
			]
		),
	},
	{
		c: "R",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				224, 14, 2, 15, 1, 15, 1, 3, 9, 3, 1, 3, 9, 3, 1, 3, 9, 3, 1, 3, 9, 3, 1, 3, 8, 4, 1, 14, 2, 14, 2, 14, 2, 3, 8, 4, 1, 3, 9, 3, 1, 3,
				9, 3, 1, 3, 9, 7, 9, 7, 10, 6, 10, 3,
			]
		),
	},
	{
		c: "S",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				226, 7, 7, 12, 4, 14, 3, 5, 4, 6, 1, 4, 8, 4, 1, 4, 9, 3, 1, 4, 13, 5, 13, 12, 6, 13, 6, 12, 13, 4, 14, 3, 1, 4, 9, 8, 9, 3, 1, 5, 7,
				4, 2, 15, 3, 13, 5, 10,
			]
		),
	},
	{
		c: "S",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				213, 6, 7, 12, 3, 14, 1, 5, 5, 5, 1, 3, 9, 3, 1, 3, 9, 3, 1, 3, 13, 5, 11, 13, 4, 14, 5, 11, 13, 4, 13, 6, 10, 6, 10, 7, 7, 20, 2, 14,
				4, 10,
			]
		),
	},
	{
		c: "TA",
		data: ImageHelper.fromJsonBinarized(
			32,
			43,
			[
				448, 17, 4, 5, 6, 17, 4, 5, 6, 17, 4, 6, 12, 3, 10, 7, 12, 3, 10, 3, 1, 3, 12, 3, 9, 3, 3, 3, 11, 3, 9, 3, 3, 3, 11, 3, 8, 4, 3, 4,
				10, 3, 8, 3, 5, 3, 10, 3, 8, 3, 5, 3, 10, 3, 7, 3, 7, 3, 9, 3, 7, 13, 9, 3, 6, 15, 8, 3, 6, 15, 8, 3, 5, 4, 9, 3, 8, 3, 5, 4, 10, 3,
				7, 3, 5, 3, 11, 3,
			]
		),
	},
	{
		c: "T",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[224, 48, 6, 4, 12, 4, 12, 4, 12, 4, 12, 4, 12, 4, 12, 4, 12, 4, 12, 4, 12, 4, 12, 4, 12, 4, 12, 4, 12, 4, 13, 2]
		),
	},
	{
		c: "Ta",
		data: ImageHelper.fromJsonBinarized(
			30,
			43,
			[
				421, 16, 13, 17, 14, 16, 20, 3, 27, 3, 10, 8, 9, 3, 9, 11, 7, 3, 8, 4, 4, 4, 7, 3, 8, 2, 7, 3, 7, 3, 17, 3, 7, 3, 10, 10, 7, 3, 8, 12,
				7, 3, 8, 6, 3, 3, 7, 3, 7, 4, 6, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 4, 6, 3, 7, 3, 7, 13, 7, 3, 8, 12, 21, 4,
			]
		),
	},
	{
		c: "U",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[224, 3, 10, 6, 10, 6, 10, 6, 10, 6, 10, 6, 10, 6, 10, 6, 10, 6, 10, 6, 10, 6, 10, 6, 10, 6, 10, 7, 8, 9, 6, 5, 1, 14, 3, 12, 5, 10]
		),
	},
	{
		c: "V",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				238, 3, 11, 6, 10, 8, 9, 3, 2, 3, 9, 3, 2, 4, 7, 4, 3, 3, 7, 3, 4, 3, 6, 4, 4, 4, 5, 3, 6, 3, 5, 3, 6, 3, 4, 4, 7, 3, 3, 3, 8, 3, 2,
				4, 8, 4, 1, 3, 10, 7, 10, 7, 11, 5, 12, 5,
			]
		),
	},
	{
		c: "W",
		data: ImageHelper.fromJsonBinarized(
			23,
			43,
			[
				322, 4, 5, 5, 5, 4, 1, 3, 5, 5, 5, 3, 2, 3, 5, 5, 5, 3, 2, 3, 4, 6, 5, 3, 2, 4, 3, 3, 1, 3, 3, 4, 2, 4, 3, 3, 1, 3, 3, 3, 4, 3, 3, 3,
				1, 3, 3, 3, 4, 3, 3, 3, 1, 3, 3, 3, 4, 3, 3, 2, 2, 3, 3, 3, 4, 3, 2, 3, 3, 3, 1, 4, 5, 3, 1, 3, 3, 3, 1, 3, 6, 3, 1, 3, 3, 3, 1, 3, 6,
				3, 1, 3, 3, 3, 1, 3, 6, 3, 1, 2, 5, 6, 7, 5, 5, 6, 7, 5, 5, 5, 8, 5, 5, 5, 9, 3, 7, 3,
			]
		),
	},
	{
		c: "X",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				225, 2, 9, 2, 3, 3, 7, 3, 4, 3, 5, 4, 4, 4, 3, 4, 6, 3, 3, 3, 8, 7, 10, 6, 10, 5, 11, 5, 11, 5, 10, 7, 8, 4, 1, 4, 6, 4, 3, 4, 5, 3,
				5, 3, 4, 4, 6, 3, 2, 4, 8, 3, 1, 3, 9, 5,
			]
		),
	},
	{
		c: "Y",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				238, 4, 9, 4, 1, 4, 8, 4, 1, 4, 7, 4, 3, 4, 6, 3, 5, 3, 5, 4, 5, 4, 3, 4, 7, 4, 2, 3, 9, 3, 1, 4, 9, 7, 11, 5, 13, 4, 13, 3, 14, 3,
				14, 3, 14, 3, 14, 3, 14, 3,
			]
		),
	},
	{
		c: "Z",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[225, 14, 2, 14, 2, 14, 11, 5, 10, 5, 10, 5, 10, 5, 10, 5, 11, 4, 11, 4, 11, 4, 11, 4, 11, 4, 11, 4, 11, 4, 9, 2, 1, 39, 1, 7]
		),
	},
	{
		c: "[",
		data: ImageHelper.fromJsonBinarized(
			6,
			43,
			[78, 21, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 12]
		),
	},
	{
		c: "]",
		data: ImageHelper.fromJsonBinarized(
			7,
			43,
			[92, 5, 1, 7, 1, 6, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 17]
		),
	},
	{ c: "^", data: ImageHelper.fromJsonBinarized(10, 43, [143, 4, 6, 5, 4, 6, 4, 3, 1, 3, 2, 3, 2, 3, 2, 3, 3, 3, 1, 2, 4, 6, 4, 3]) },
	{ c: "_", data: ImageHelper.fromJsonBinarized(10, 43, [331, 19]) },
	{
		c: "a",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[244, 2, 8, 10, 3, 12, 2, 5, 2, 5, 1, 4, 6, 3, 11, 3, 3, 11, 2, 12, 1, 13, 1, 3, 7, 3, 1, 3, 7, 3, 1, 4, 5, 4, 1, 13, 2, 13, 2, 7, 2, 3]
		),
	},
	{
		c: "a",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[236, 10, 2, 12, 1, 3, 5, 8, 6, 3, 10, 3, 2, 11, 1, 20, 2, 6, 7, 6, 7, 6, 7, 16, 1, 12, 2, 7, 2, 2]
		),
	},
	{
		c: "a",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[255, 9, 4, 11, 2, 4, 5, 3, 2, 3, 7, 3, 11, 3, 3, 11, 1, 13, 1, 6, 4, 7, 7, 6, 8, 7, 6, 4, 1, 13, 1, 13, 3, 7, 1, 3]
		),
	},
	{
		c: "a",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[254, 10, 3, 12, 2, 4, 4, 4, 2, 3, 6, 3, 11, 3, 3, 11, 2, 12, 1, 8, 2, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 13, 2, 13, 2, 7, 2, 2]
		),
	},
	{
		c: "b",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				196, 3, 11, 3, 11, 3, 11, 3, 11, 12, 2, 13, 1, 5, 4, 4, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 7, 7, 3, 1, 3, 7, 3, 1, 3, 7, 3,
				1, 4, 6, 3, 1, 13, 1, 12, 2, 3, 1, 7,
			]
		),
	},
	{ c: "c", data: ImageHelper.fromJsonBinarized(13, 43, [236, 10, 2, 17, 4, 7, 7, 6, 7, 6, 10, 3, 10, 3, 10, 3, 7, 6, 7, 7, 6, 16, 1, 11, 3, 8]) },
	{ c: "c", data: ImageHelper.fromJsonBinarized(13, 43, [235, 11, 1, 18, 3, 8, 7, 6, 7, 6, 10, 3, 10, 3, 10, 3, 7, 6, 7, 7, 5, 17, 1, 11, 3, 8]) },
	{
		c: "c",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[254, 10, 3, 12, 2, 4, 4, 5, 1, 3, 7, 7, 7, 6, 11, 3, 11, 3, 11, 3, 8, 7, 7, 3, 1, 3, 6, 4, 1, 12, 3, 11, 4, 8]
		),
	},
	{
		c: "d",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[207, 3, 11, 3, 11, 3, 11, 3, 2, 12, 1, 13, 1, 4, 4, 9, 6, 7, 8, 6, 8, 6, 8, 6, 8, 6, 8, 7, 6, 8, 6, 4, 1, 13, 1, 13, 2, 8, 1, 3]
		),
	},
	{
		c: "d",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[207, 3, 11, 3, 11, 3, 11, 3, 2, 12, 1, 13, 1, 4, 4, 9, 6, 7, 8, 6, 8, 6, 8, 6, 8, 6, 8, 7, 6, 8, 6, 4, 1, 13, 1, 13, 2, 8, 1, 3]
		),
	},
	{
		c: "d",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				207, 3, 11, 3, 11, 3, 5, 3, 3, 3, 2, 12, 1, 13, 1, 6, 1, 10, 6, 8, 7, 6, 8, 7, 7, 6, 8, 7, 7, 7, 6, 4, 1, 3, 6, 4, 1, 13, 2, 12, 3, 7,
				1, 3,
			]
		),
	},
	{
		c: "e",
		data: ImageHelper.fromJsonBinarized(14, 43, [254, 10, 3, 12, 2, 4, 5, 4, 1, 3, 7, 7, 7, 49, 11, 3, 7, 3, 1, 3, 7, 3, 1, 13, 2, 11, 4, 9]),
	},
	{
		c: "e",
		data: ImageHelper.fromJsonBinarized(14, 43, [245, 1, 8, 10, 3, 12, 2, 4, 5, 8, 7, 6, 8, 48, 11, 3, 8, 3, 1, 3, 6, 4, 1, 13, 2, 11, 4, 8]),
	},
	{ c: "e", data: ImageHelper.fromJsonBinarized(13, 43, [236, 10, 2, 16, 6, 6, 7, 6, 7, 45, 10, 3, 7, 6, 7, 16, 1, 11, 4, 8]) },
	{ c: "e", data: ImageHelper.fromJsonBinarized(13, 43, [226, 2, 7, 11, 1, 17, 5, 7, 7, 6, 7, 45, 10, 3, 7, 6, 7, 16, 1, 11, 3, 9]) },
	{ c: "e", data: ImageHelper.fromJsonBinarized(13, 43, [225, 1, 1, 2, 7, 10, 1, 18, 4, 7, 7, 6, 7, 45, 10, 3, 7, 6, 7, 16, 1, 11, 3, 9]) },
	{
		c: "f",
		data: ImageHelper.fromJsonBinarized(
			9,
			43,
			[122, 4, 3, 6, 3, 6, 2, 4, 5, 3, 4, 27, 2, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3]
		),
	},
	{
		c: "f",
		data: ImageHelper.fromJsonBinarized(
			10,
			43,
			[136, 4, 4, 6, 3, 7, 3, 4, 6, 3, 4, 30, 3, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3]
		),
	},
	{
		c: "g",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				261, 1, 7, 1, 2, 13, 1, 14, 1, 3, 7, 3, 2, 3, 7, 3, 2, 3, 7, 3, 2, 13, 3, 11, 4, 10, 4, 3, 12, 11, 4, 13, 2, 17, 9, 6, 9, 8, 5, 5, 1,
				13, 3, 11,
			]
		),
	},
	{
		c: "g",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				278, 3, 4, 3, 2, 14, 1, 15, 1, 4, 5, 4, 3, 3, 7, 3, 3, 3, 7, 3, 3, 13, 4, 12, 4, 10, 5, 3, 13, 12, 4, 13, 3, 14, 1, 4, 8, 3, 1, 3, 9,
				3, 2, 5, 4, 5, 2, 14, 3, 12,
			]
		),
	},
	{
		c: "h",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				196, 4, 10, 4, 10, 4, 10, 4, 10, 12, 2, 13, 1, 13, 1, 4, 6, 8, 6, 8, 6, 8, 6, 8, 6, 8, 6, 3, 1, 4, 6, 3, 1, 4, 6, 3, 1, 4, 6, 3, 1, 4,
				6, 3, 1, 4, 6, 3,
			]
		),
	},
	{
		c: "i",
		data: ImageHelper.fromJsonBinarized(4, 43, [56, 12, 5, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3, 1, 3]),
	},
	{ c: "i", data: ImageHelper.fromJsonBinarized(4, 43, [56, 12, 4, 56]) },
	{
		c: "ic",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				266, 4, 15, 4, 15, 4, 34, 3, 5, 10, 1, 4, 3, 16, 2, 5, 4, 8, 2, 3, 7, 7, 2, 3, 7, 6, 3, 3, 10, 4, 2, 3, 10, 4, 2, 3, 10, 4, 2, 3, 7,
				7, 2, 3, 7, 7, 2, 4, 6, 7, 3, 16, 3, 11, 10, 7,
			]
		),
	},
	{
		c: "j",
		data: ImageHelper.fromJsonBinarized(
			7,
			43,
			[101, 4, 3, 4, 3, 4, 10, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 10, 1, 6, 1, 5]
		),
	},
	{
		c: "k",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[
				182, 4, 9, 4, 9, 4, 9, 4, 9, 4, 4, 4, 1, 4, 3, 5, 1, 4, 3, 4, 2, 4, 2, 3, 4, 4, 1, 4, 4, 8, 5, 7, 6, 4, 1, 3, 5, 4, 1, 4, 4, 4, 2, 4,
				3, 4, 3, 4, 2, 4, 4, 4, 1, 4, 5, 4, 1, 2, 7, 3,
			]
		),
	},
	{ c: "l", data: ImageHelper.fromJsonBinarized(4, 43, [56, 68, 1, 2]) },
	{ c: "l", data: ImageHelper.fromJsonBinarized(3, 43, [42, 54]) },
	{
		c: "m",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				342, 10, 1, 7, 1, 24, 2, 6, 1, 8, 5, 3, 5, 6, 5, 3, 5, 6, 5, 3, 5, 6, 5, 3, 5, 6, 5, 3, 5, 6, 5, 3, 5, 6, 5, 3, 5, 6, 5, 3, 5, 6, 5,
				3, 5, 6, 5, 3, 5, 6, 5, 3, 5, 3,
			]
		),
	},
	{
		c: "mi",
		data: ImageHelper.fromJsonBinarized(
			26,
			43,
			[
				387, 3, 23, 3, 24, 2, 27, 17, 6, 21, 4, 23, 3, 3, 1, 3, 4, 4, 4, 4, 3, 3, 1, 3, 4, 4, 4, 4, 3, 3, 1, 3, 5, 3, 4, 4, 3, 7, 5, 3, 4, 4,
				3, 3, 1, 3, 5, 3, 4, 4, 3, 3, 1, 3, 5, 3, 4, 4, 3, 3, 1, 3, 5, 3, 4, 4, 3, 3, 1, 3, 5, 3, 5, 3, 3, 3, 1, 3, 5, 3, 5, 3, 3, 3, 1, 2, 6,
				2, 6, 3, 3, 3, 18, 1, 5, 1,
			]
		),
	},
	{
		c: "n",
		data: ImageHelper.fromJsonBinarized(13, 43, [234, 11, 2, 12, 1, 16, 6, 7, 6, 7, 6, 7, 6, 7, 7, 6, 6, 7, 6, 7, 7, 6, 6, 7, 6, 7, 7, 3]),
	},
	{
		c: "n",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[253, 11, 3, 12, 2, 12, 2, 3, 6, 8, 6, 4, 1, 3, 6, 4, 1, 3, 6, 4, 1, 3, 6, 8, 6, 4, 1, 3, 6, 4, 1, 3, 6, 8, 6, 4, 1, 3, 6, 4, 1, 3, 6, 4]
		),
	},
	{
		c: "o",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[244, 2, 8, 10, 3, 12, 1, 4, 5, 4, 1, 3, 7, 3, 1, 3, 7, 7, 8, 6, 8, 6, 8, 6, 7, 7, 7, 3, 1, 3, 7, 3, 1, 13, 2, 12, 3, 9]
		),
	},
	{
		c: "o",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[244, 2, 8, 10, 3, 12, 2, 4, 4, 9, 7, 6, 8, 6, 8, 6, 8, 6, 8, 6, 8, 6, 8, 3, 1, 3, 6, 4, 1, 13, 1, 12, 4, 8]
		),
	},
	{
		c: "o",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[245, 1, 8, 10, 3, 12, 1, 5, 5, 7, 8, 6, 8, 6, 8, 6, 8, 6, 8, 6, 8, 6, 8, 7, 6, 4, 1, 12, 2, 12, 4, 9]
		),
	},
	{
		c: "o",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[243, 5, 6, 11, 2, 12, 2, 5, 3, 9, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 3, 1, 3, 6, 4, 1, 13, 1, 12, 4, 9]
		),
	},
	{
		c: "o",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[243, 4, 7, 10, 3, 12, 1, 5, 4, 8, 8, 6, 8, 6, 8, 6, 8, 6, 8, 6, 8, 6, 8, 7, 6, 4, 1, 12, 2, 12, 4, 9]
		),
	},
	{
		c: "o",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[243, 5, 6, 11, 2, 12, 2, 4, 4, 9, 7, 6, 8, 6, 8, 6, 8, 6, 8, 6, 8, 6, 8, 7, 6, 4, 1, 13, 1, 12, 4, 9]
		),
	},
	{
		c: "p",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[252, 12, 2, 13, 1, 5, 4, 4, 1, 3, 7, 3, 1, 3, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 7, 9, 4, 4, 1, 13, 1, 12, 2, 3, 2, 5, 4, 3, 11, 3, 11, 3]
		),
	},
	{
		c: "q",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				242, 1, 1, 1, 8, 12, 1, 13, 1, 5, 2, 6, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 5, 3,
				5, 1, 13, 2, 12, 4, 6, 1, 3, 11, 3, 11, 4, 10, 4,
			]
		),
	},
	{ c: "r", data: ImageHelper.fromJsonBinarized(9, 43, [162, 31, 5, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3]) },
	{ c: "r", data: ImageHelper.fromJsonBinarized(10, 43, [180, 34, 6, 4, 6, 4, 6, 4, 6, 4, 7, 3, 6, 4, 6, 4, 6, 4, 6, 4, 7, 2]) },
	{ c: "r", data: ImageHelper.fromJsonBinarized(10, 43, [180, 3, 1, 30, 6, 4, 6, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3]) },
	{ c: "r", data: ImageHelper.fromJsonBinarized(10, 43, [180, 34, 6, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3]) },
	{ c: "r", data: ImageHelper.fromJsonBinarized(10, 43, [180, 10, 1, 9, 1, 9, 1, 4, 5, 4, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3]) },
	{ c: "r", data: ImageHelper.fromJsonBinarized(9, 43, [162, 3, 1, 27, 5, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3]) },
	{ c: "r", data: ImageHelper.fromJsonBinarized(10, 43, [180, 3, 1, 30, 6, 4, 6, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3]) },
	{
		c: "rf",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				276, 4, 14, 6, 14, 6, 13, 4, 10, 1, 5, 3, 4, 65, 8, 4, 3, 4, 9, 4, 3, 4, 9, 4, 3, 4, 9, 4, 3, 4, 9, 4, 3, 4, 9, 4, 3, 4, 9, 4, 3, 4,
				9, 4, 3, 4, 9, 4, 3, 4, 9, 4, 4, 3, 9, 3,
			]
		),
	},
	{
		c: "s",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[227, 2, 7, 10, 2, 12, 1, 3, 5, 7, 7, 3, 1, 3, 10, 9, 4, 11, 5, 9, 10, 6, 7, 7, 6, 3, 1, 12, 1, 12, 3, 8]
		),
	},
	{
		c: "s",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[226, 3, 6, 10, 2, 12, 1, 4, 4, 4, 1, 3, 6, 3, 1, 3, 10, 10, 4, 11, 4, 9, 10, 7, 7, 6, 6, 29, 3, 9]
		),
	},
	{
		c: "s",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[228, 1, 7, 10, 2, 12, 1, 3, 5, 4, 1, 3, 6, 3, 1, 3, 10, 9, 5, 10, 5, 9, 10, 7, 6, 7, 6, 3, 1, 12, 1, 12, 3, 8]
		),
	},
	{
		c: "s",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[227, 2, 7, 10, 2, 12, 1, 3, 5, 4, 1, 3, 6, 3, 1, 3, 10, 9, 4, 11, 5, 9, 10, 6, 7, 7, 6, 3, 1, 12, 1, 12, 3, 8]
		),
	},
	{
		c: "t",
		data: ImageHelper.fromJsonBinarized(
			10,
			43,
			[143, 1, 9, 3, 7, 3, 7, 3, 4, 30, 3, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 7, 3, 7, 5, 5]
		),
	},
	{
		c: "t",
		data: ImageHelper.fromJsonBinarized(
			10,
			43,
			[143, 3, 7, 3, 7, 3, 7, 3, 4, 30, 3, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 4, 6, 7, 4, 6, 5, 5]
		),
	},
	{
		c: "t",
		data: ImageHelper.fromJsonBinarized(
			11,
			43,
			[158, 3, 7, 4, 7, 4, 7, 4, 4, 33, 3, 4, 7, 4, 7, 4, 7, 4, 7, 4, 7, 4, 7, 4, 7, 4, 7, 8, 4, 7, 5, 6]
		),
	},
	{
		c: "u",
		data: ImageHelper.fromJsonBinarized(13, 43, [234, 3, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 8, 4, 18, 1, 12, 2, 6, 2, 2]),
	},
	{
		c: "u",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[234, 3, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 7, 5, 4, 1, 12, 1, 12, 3, 6, 1, 3]
		),
	},
	{
		c: "u",
		data: ImageHelper.fromJsonBinarized(13, 43, [234, 3, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 7, 5, 17, 1, 12, 3, 6, 1, 3]),
	},
	{
		c: "u",
		data: ImageHelper.fromJsonBinarized(13, 43, [234, 3, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 7, 5, 17, 1, 12, 3, 5, 2, 3]),
	},
	{
		c: "v",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				270, 4, 7, 4, 1, 3, 7, 3, 2, 4, 5, 4, 3, 3, 5, 4, 3, 3, 5, 3, 4, 4, 3, 4, 5, 3, 3, 3, 6, 3, 3, 3, 7, 3, 1, 3, 8, 3, 1, 3, 8, 7, 9, 5,
				10, 5, 11, 3,
			]
		),
	},
	{
		c: "w",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				342, 3, 5, 4, 4, 6, 4, 5, 4, 7, 3, 5, 4, 3, 1, 3, 3, 5, 4, 3, 1, 3, 3, 2, 1, 3, 2, 3, 2, 3, 2, 3, 1, 3, 2, 3, 3, 2, 2, 3, 1, 3, 2, 3,
				3, 3, 1, 3, 2, 2, 2, 3, 3, 3, 1, 2, 3, 6, 4, 3, 1, 2, 3, 6, 4, 6, 3, 6, 5, 5, 4, 5, 5, 5, 4, 4, 7, 3, 5, 3,
			]
		),
	},
	{
		c: "x",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[234, 4, 5, 4, 1, 4, 3, 4, 3, 3, 3, 3, 5, 3, 1, 4, 5, 7, 7, 5, 8, 5, 8, 5, 7, 7, 5, 4, 1, 4, 3, 4, 3, 4, 2, 3, 5, 3, 1, 4, 5, 7, 7, 2]
		),
	},
	{
		c: "y",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				252, 4, 7, 3, 1, 4, 5, 4, 1, 4, 5, 4, 2, 3, 5, 3, 3, 4, 3, 4, 4, 3, 3, 3, 5, 4, 1, 4, 6, 3, 1, 3, 7, 7, 8, 5, 9, 5, 10, 4, 10, 3, 10,
				4, 6, 7, 7, 6, 8, 5,
			]
		),
	},
	{
		c: "y",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				252, 4, 6, 8, 6, 3, 2, 4, 4, 4, 2, 4, 4, 4, 3, 3, 3, 4, 4, 4, 2, 4, 5, 3, 1, 4, 6, 3, 1, 4, 7, 6, 8, 6, 8, 6, 9, 4, 10, 4, 9, 4, 6, 8,
				6, 7, 7, 6,
			]
		),
	},
	{
		c: "y",
		data: ImageHelper.fromJsonBinarized(
			11,
			43,
			[209, 2, 7, 4, 7, 2, 1, 2, 5, 2, 2, 2, 5, 2, 3, 2, 4, 1, 4, 2, 3, 2, 5, 1, 3, 2, 5, 5, 6, 5, 7, 3, 8, 3, 8, 2, 9, 2, 8, 2, 7, 3]
		),
	},
	{ c: "z", data: ImageHelper.fromJsonBinarized(13, 43, [235, 12, 1, 12, 1, 12, 8, 4, 8, 4, 8, 4, 8, 4, 8, 4, 8, 4, 8, 4, 8, 4, 9, 25, 1, 12]) },
	{
		c: "{",
		data: ImageHelper.fromJsonBinarized(
			6,
			43,
			[82, 2, 2, 4, 1, 5, 1, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 4, 2, 3, 3, 4, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 2, 5, 2, 4]
		),
	},
	{ c: "|", data: ImageHelper.fromJsonBinarized(3, 43, [42, 63]) },
	{
		c: "}",
		data: ImageHelper.fromJsonBinarized(
			6,
			43,
			[78, 2, 4, 4, 2, 5, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 3, 3, 2, 4, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 2, 4, 1, 5, 1, 4]
		),
	},
	{ c: "~", data: ImageHelper.fromJsonBinarized(10, 43, [231, 5, 1, 12, 1, 2, 2, 4]) },
	{ c: "¡", data: ImageHelper.fromJsonBinarized(3, 43, [54, 9, 4, 1, 1, 36]) },
	{
		c: "¢",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[
				192, 2, 8, 1, 1, 2, 3, 10, 3, 11, 1, 4, 3, 9, 4, 2, 1, 6, 3, 3, 1, 6, 3, 2, 5, 3, 2, 3, 5, 3, 2, 2, 6, 3, 1, 3, 3, 6, 1, 2, 4, 9, 4,
				15, 2, 11, 3, 8, 4, 2,
			]
		),
	},
	{
		c: "£",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				227, 6, 8, 11, 6, 12, 4, 4, 6, 4, 3, 3, 8, 3, 3, 3, 8, 3, 3, 3, 14, 3, 13, 8, 1, 1, 6, 12, 5, 12, 8, 3, 14, 3, 9, 2, 3, 3, 8, 3, 3, 3,
				8, 3, 2, 4, 7, 4, 1, 16, 1, 15, 2, 1, 6, 5,
			]
		),
	},
	{ c: "¤", data: ImageHelper.fromJsonBinarized(11, 43, [209, 2, 2, 3, 2, 24, 1, 3, 3, 3, 2, 2, 5, 6, 5, 6, 5, 3, 1, 3, 3, 3, 2, 32, 1, 1, 7, 1]) },
	{
		c: "¥",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				238, 4, 9, 4, 1, 4, 7, 4, 3, 3, 7, 3, 4, 4, 5, 4, 5, 4, 3, 4, 7, 3, 3, 3, 8, 4, 1, 4, 5, 16, 1, 16, 1, 16, 7, 3, 8, 16, 1, 16, 7, 3,
				14, 3, 14, 3, 14, 3, 14, 3,
			]
		),
	},
	{
		c: "§",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[
				160, 1, 1, 2, 7, 9, 3, 11, 2, 6, 1, 4, 1, 3, 6, 3, 1, 4, 10, 9, 4, 11, 1, 16, 6, 7, 7, 6, 7, 15, 2, 11, 5, 8, 11, 6, 7, 7, 5, 3, 2,
				11, 2, 11, 5, 5,
			]
		),
	},
	{
		c: "©",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				257, 8, 9, 3, 5, 3, 6, 2, 9, 2, 4, 2, 2, 6, 3, 2, 2, 2, 2, 9, 2, 1, 2, 1, 2, 4, 3, 3, 2, 2, 1, 1, 2, 3, 5, 2, 3, 3, 2, 3, 5, 2, 3, 3,
				2, 3, 10, 3, 2, 3, 5, 2, 3, 1, 1, 1, 2, 3, 5, 3, 2, 1, 1, 1, 2, 3, 5, 2, 2, 2, 1, 2, 2, 9, 2, 1, 3, 2, 1, 8, 2, 2, 4, 2, 5, 1, 3, 2,
				6, 2, 6, 3, 8, 9, 12, 3,
			]
		),
	},
	{
		c: "«",
		data: ImageHelper.fromJsonBinarized(
			12,
			43,
			[
				221, 1, 5, 1, 4, 2, 4, 2, 3, 3, 3, 3, 2, 4, 1, 4, 2, 3, 2, 4, 2, 3, 2, 4, 3, 2, 3, 3, 4, 3, 2, 3, 5, 3, 2, 4, 4, 3, 2, 4, 4, 3, 2, 4,
				4, 2, 3, 3, 5, 1, 5, 1,
			]
		),
	},
	{ c: "¬", data: ImageHelper.fromJsonBinarized(11, 43, [250, 1, 2, 22, 8, 3, 8, 3, 8, 3, 8, 3]) },
	{
		c: "®",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				257, 8, 8, 4, 4, 4, 5, 3, 8, 3, 4, 2, 1, 8, 2, 2, 2, 2, 2, 9, 2, 1, 2, 1, 2, 10, 2, 4, 3, 2, 4, 3, 3, 3, 3, 2, 4, 3, 3, 3, 3, 9, 3, 3,
				3, 8, 4, 3, 3, 2, 4, 3, 3, 1, 1, 1, 3, 2, 4, 3, 2, 2, 1, 2, 2, 2, 5, 2, 2, 1, 3, 2, 1, 2, 5, 5, 3, 3, 8, 3, 5, 3, 6, 3, 8, 9, 11, 3,
			]
		),
	},
	{ c: "°", data: ImageHelper.fromJsonBinarized(6, 43, [74, 2, 2, 5, 1, 2, 2, 3, 3, 4, 1, 8, 3, 1]) },
	{ c: "±", data: ImageHelper.fromJsonBinarized(14, 43, [216, 3, 11, 3, 11, 3, 11, 3, 5, 42, 6, 3, 11, 3, 11, 3, 11, 3, 33, 42]) },
	{ c: "²", data: ImageHelper.fromJsonBinarized(9, 43, [120, 4, 3, 8, 1, 8, 1, 2, 4, 2, 7, 2, 3, 6, 1, 7, 2, 3, 6, 17, 1, 8]) },
	{ c: "³", data: ImageHelper.fromJsonBinarized(8, 43, [106, 3, 3, 7, 1, 3, 2, 5, 4, 2, 2, 6, 2, 6, 6, 4, 4, 5, 2, 10]) },
	{
		c: "¶",
		data: ImageHelper.fromJsonBinarized(
			12,
			43,
			[
				158, 10, 1, 30, 2, 10, 2, 10, 2, 10, 2, 10, 2, 3, 1, 6, 2, 3, 2, 5, 2, 3, 4, 3, 2, 3, 4, 3, 2, 3, 4, 3, 2, 3, 4, 3, 2, 3, 4, 3, 2, 3,
				4, 3, 2, 3, 4, 3, 2, 3, 4, 3, 2, 3, 4, 3, 2, 3, 9, 1,
			]
		),
	},
	{ c: "·", data: ImageHelper.fromJsonBinarized(6, 43, [121, 4, 1, 18, 1, 4, 3, 2]) },
	{ c: "¹", data: ImageHelper.fromJsonBinarized(5, 43, [70, 10, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2]) },
	{
		c: "»",
		data: ImageHelper.fromJsonBinarized(
			12,
			43,
			[
				216, 1, 4, 1, 6, 2, 3, 2, 5, 3, 2, 4, 3, 4, 2, 4, 4, 4, 1, 4, 4, 3, 2, 4, 4, 3, 2, 3, 3, 3, 3, 3, 2, 4, 1, 4, 2, 3, 2, 4, 2, 3, 2, 4,
				3, 2, 3, 3, 4, 1,
			]
		),
	},
	{
		c: "¼",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				252, 5, 8, 3, 2, 5, 7, 3, 6, 2, 7, 3, 6, 2, 6, 3, 7, 2, 5, 3, 8, 2, 5, 3, 8, 2, 4, 3, 9, 2, 3, 3, 10, 2, 2, 3, 4, 3, 8, 3, 3, 4, 7, 3,
				3, 5, 6, 3, 4, 2, 1, 2, 6, 2, 3, 3, 2, 2, 5, 3, 3, 2, 3, 2, 4, 3, 3, 9, 2, 3, 4, 9, 2, 2, 11, 2,
			]
		),
	},
	{
		c: "½",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				238, 4, 8, 3, 2, 4, 7, 3, 5, 2, 7, 2, 6, 2, 6, 3, 6, 2, 5, 3, 7, 2, 4, 3, 8, 2, 4, 2, 9, 2, 3, 3, 9, 2, 2, 3, 1, 7, 5, 3, 1, 3, 3, 2,
				4, 3, 2, 2, 4, 2, 4, 3, 8, 2, 3, 3, 6, 5, 2, 3, 5, 6, 2, 3, 5, 3, 6, 2, 6, 2, 5, 4, 6, 8,
			]
		),
	},
	{
		c: "¾",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				250, 3, 14, 7, 8, 2, 2, 2, 1, 1, 1, 3, 6, 3, 2, 1, 5, 2, 5, 3, 5, 5, 5, 3, 6, 5, 4, 3, 10, 3, 2, 3, 5, 2, 5, 2, 2, 3, 5, 3, 3, 3, 1,
				3, 7, 7, 1, 3, 3, 3, 9, 3, 3, 4, 8, 3, 3, 5, 7, 3, 3, 3, 1, 2, 7, 3, 2, 3, 2, 2, 6, 3, 2, 3, 3, 2, 5, 3, 3, 9, 3, 3, 4, 9, 2, 3, 11,
				2,
			]
		),
	},
	{
		c: "¿",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[313, 4, 13, 4, 13, 4, 31, 2, 14, 3, 14, 3, 11, 6, 9, 8, 8, 6, 11, 4, 12, 4, 9, 8, 9, 8, 9, 4, 1, 3, 9, 3, 2, 15, 3, 13, 6, 9]
		),
	},
	{
		c: "À",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				168, 3, 2, 3, 9, 9, 8, 9, 15, 2, 31, 4, 13, 6, 12, 6, 12, 7, 10, 4, 1, 3, 10, 3, 2, 3, 9, 4, 2, 4, 8, 3, 4, 3, 8, 3, 4, 4, 6, 3, 6, 3,
				6, 3, 6, 4, 4, 14, 4, 14, 3, 16, 2, 4, 9, 3, 2, 3, 10, 8, 10, 4, 2, 1, 12, 1,
			]
		),
	},
	{
		c: "Á",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				170, 4, 13, 4, 14, 3, 15, 2, 34, 4, 13, 5, 13, 6, 11, 7, 11, 3, 1, 4, 10, 3, 2, 3, 9, 3, 3, 3, 9, 3, 4, 3, 7, 4, 4, 3, 7, 3, 5, 4, 6,
				3, 6, 3, 5, 13, 5, 14, 3, 15, 3, 3, 9, 4, 1, 4, 10, 3, 1, 3, 11, 4,
			]
		),
	},
	{
		c: "Â",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				169, 4, 13, 6, 11, 8, 10, 3, 3, 2, 30, 4, 13, 6, 12, 6, 12, 7, 10, 4, 1, 3, 10, 3, 2, 3, 9, 4, 3, 3, 8, 3, 4, 3, 8, 3, 4, 4, 6, 4, 5,
				3, 6, 3, 6, 4, 4, 14, 4, 14, 3, 16, 2, 4, 8, 4, 2, 3, 10, 3, 1, 4, 10, 7, 14, 1,
			]
		),
	},
	{
		c: "Ä",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				167, 3, 2, 3, 10, 3, 2, 3, 10, 3, 2, 3, 48, 4, 13, 6, 12, 6, 12, 7, 10, 4, 1, 3, 10, 3, 2, 3, 9, 4, 2, 4, 8, 3, 4, 3, 8, 3, 4, 4, 6,
				3, 6, 3, 6, 3, 6, 3, 5, 14, 4, 14, 3, 16, 2, 4, 8, 4, 2, 3, 10, 8, 10, 5, 1, 1, 12, 1, 1, 1,
			]
		),
	},
	{
		c: "Å",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				134, 2, 15, 4, 13, 3, 1, 2, 12, 2, 2, 2, 13, 5, 14, 3, 32, 4, 13, 6, 12, 6, 12, 7, 10, 4, 1, 3, 10, 3, 2, 3, 9, 4, 2, 4, 8, 3, 4, 3,
				7, 4, 4, 4, 6, 3, 6, 3, 6, 3, 6, 4, 4, 14, 4, 14, 3, 16, 2, 4, 9, 3, 2, 3, 10, 8, 10, 5, 14, 2,
			]
		),
	},
	{
		c: "Æ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				302, 13, 8, 13, 7, 13, 8, 6, 14, 3, 1, 3, 14, 3, 1, 3, 13, 3, 2, 3, 12, 4, 2, 10, 5, 3, 3, 10, 4, 4, 3, 10, 4, 3, 4, 3, 10, 11, 10,
				11, 9, 12, 9, 3, 6, 4, 7, 4, 6, 14, 7, 12, 15, 1, 3, 1,
			]
		),
	},
	{
		c: "Ç",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				239, 8, 7, 14, 3, 15, 3, 6, 2, 1, 1, 6, 2, 3, 9, 4, 1, 4, 10, 3, 1, 4, 10, 3, 1, 4, 14, 4, 14, 4, 14, 4, 14, 4, 11, 2, 1, 4, 10, 8,
				10, 3, 1, 4, 9, 4, 2, 5, 6, 5, 2, 15, 4, 14, 6, 9, 11, 3, 15, 6, 12, 1, 2, 3, 12, 6, 11, 6,
			]
		),
	},
	{
		c: "É",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[134, 1, 12, 2, 11, 2, 35, 30, 11, 3, 11, 3, 11, 3, 11, 3, 11, 13, 1, 13, 1, 12, 2, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 28]
		),
	},
	{
		c: "Í",
		data: ImageHelper.fromJsonBinarized(
			5,
			43,
			[46, 8, 1, 3, 2, 2, 8, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3, 2, 3]
		),
	},
	{
		c: "Ð",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				253, 14, 4, 15, 3, 16, 2, 3, 9, 4, 2, 3, 10, 3, 2, 3, 10, 4, 1, 3, 10, 15, 3, 15, 3, 15, 3, 4, 1, 3, 10, 4, 1, 3, 10, 4, 1, 3, 10, 3,
				2, 3, 9, 4, 2, 9, 1, 6, 2, 15, 3, 14, 4, 11,
			]
		),
	},
	{
		c: "Ñ",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				149, 3, 3, 2, 7, 9, 7, 2, 1, 5, 36, 5, 8, 8, 8, 9, 7, 9, 7, 6, 1, 3, 6, 6, 1, 4, 5, 6, 2, 3, 5, 6, 2, 4, 4, 6, 3, 4, 3, 6, 3, 4, 3, 6,
				4, 4, 2, 6, 5, 3, 2, 6, 5, 4, 1, 6, 6, 3, 1, 6, 7, 9, 7, 9, 8, 5,
			]
		),
	},
	{
		c: "Ò",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				158, 3, 15, 3, 15, 3, 14, 3, 12, 7, 7, 13, 3, 15, 1, 6, 5, 5, 1, 4, 9, 7, 10, 7, 11, 6, 11, 6, 11, 6, 11, 6, 11, 6, 11, 6, 11, 6, 10,
				7, 10, 8, 8, 4, 2, 15, 3, 13, 6, 9,
			]
		),
	},
	{
		c: "Ó",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				170, 4, 14, 3, 14, 3, 15, 2, 16, 5, 9, 13, 4, 15, 2, 5, 6, 5, 2, 4, 9, 4, 1, 3, 10, 4, 1, 3, 10, 4, 1, 3, 11, 3, 1, 3, 11, 7, 11, 7,
				11, 3, 1, 3, 11, 3, 1, 3, 11, 3, 1, 3, 10, 4, 1, 3, 10, 4, 1, 4, 8, 4, 3, 15, 3, 14, 7, 8,
			]
		),
	},
	{
		c: "Ô",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				169, 4, 13, 6, 12, 3, 1, 3, 10, 3, 3, 2, 11, 6, 9, 13, 4, 15, 2, 5, 6, 5, 2, 4, 9, 4, 1, 3, 10, 4, 1, 3, 10, 8, 10, 8, 11, 7, 11, 7,
				11, 7, 11, 3, 1, 3, 10, 4, 1, 3, 10, 4, 1, 3, 10, 4, 1, 4, 8, 4, 3, 15, 3, 14, 7, 8,
			]
		),
	},
	{
		c: "Õ",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				168, 3, 2, 3, 9, 8, 9, 9, 29, 7, 8, 13, 4, 15, 2, 5, 6, 5, 2, 3, 10, 3, 1, 4, 10, 8, 10, 8, 10, 8, 10, 8, 10, 8, 10, 8, 10, 8, 10, 8,
				10, 3, 2, 3, 10, 3, 2, 4, 8, 4, 2, 16, 3, 14, 7, 8,
			]
		),
	},
	{
		c: "Ö",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				167, 3, 2, 3, 10, 4, 1, 3, 10, 3, 2, 3, 30, 5, 9, 13, 4, 15, 2, 5, 6, 5, 2, 4, 9, 3, 2, 3, 10, 4, 1, 3, 11, 3, 1, 3, 11, 3, 1, 3, 11,
				7, 11, 3, 1, 3, 11, 3, 1, 3, 11, 3, 1, 3, 11, 3, 1, 3, 11, 3, 1, 3, 10, 3, 2, 4, 8, 4, 3, 15, 3, 14, 7, 8,
			]
		),
	},
	{
		c: "×",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				241, 3, 8, 2, 1, 5, 6, 4, 1, 5, 4, 4, 3, 5, 2, 4, 5, 9, 7, 7, 9, 5, 10, 6, 8, 8, 6, 4, 1, 5, 4, 4, 3, 5, 2, 4, 5, 5, 1, 3, 7, 3, 3, 1,
				9, 1,
			]
		),
	},
	{
		c: "Ø",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				231, 2, 7, 7, 1, 3, 3, 15, 2, 15, 3, 4, 7, 5, 2, 3, 7, 6, 2, 3, 7, 6, 1, 3, 7, 3, 1, 7, 6, 3, 2, 7, 5, 3, 4, 6, 5, 3, 4, 6, 4, 3, 5,
				6, 3, 3, 6, 6, 3, 3, 5, 8, 1, 3, 6, 4, 1, 6, 7, 3, 2, 5, 7, 4, 2, 16, 3, 14, 3, 3, 1, 8, 5, 3,
			]
		),
	},
	{
		c: "Ù",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				158, 4, 14, 4, 14, 4, 14, 3, 23, 4, 10, 7, 10, 7, 10, 7, 10, 3, 1, 3, 10, 7, 10, 3, 1, 3, 10, 3, 1, 3, 10, 7, 10, 3, 1, 3, 10, 7, 10,
				3, 1, 3, 10, 3, 1, 3, 10, 3, 1, 3, 9, 4, 1, 4, 7, 5, 1, 15, 3, 13, 6, 9,
			]
		),
	},
	{
		c: "Ú",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				161, 4, 12, 4, 13, 3, 13, 3, 25, 3, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 8, 9, 9,
				6, 5, 2, 15, 3, 13, 6, 9,
			]
		),
	},
	{
		c: "Û",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				160, 4, 12, 6, 10, 3, 1, 4, 9, 2, 3, 3, 21, 4, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10,
				3, 1, 3, 9, 4, 1, 5, 6, 5, 1, 15, 3, 13, 6, 9,
			]
		),
	},
	{
		c: "Ü",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				157, 3, 2, 3, 9, 4, 1, 3, 9, 4, 1, 3, 39, 3, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10, 7, 10,
				8, 9, 3, 1, 5, 6, 5, 2, 15, 3, 13, 6, 9,
			]
		),
	},
	{
		c: "Ý",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				145, 3, 13, 4, 12, 4, 13, 4, 12, 4, 7, 1, 13, 2, 1, 4, 9, 4, 1, 4, 8, 4, 1, 4, 7, 4, 3, 4, 5, 4, 4, 5, 4, 4, 5, 4, 3, 4, 7, 4, 2, 3,
				8, 4, 1, 4, 9, 7, 11, 6, 11, 5, 13, 4, 13, 3, 14, 4, 13, 3, 14, 4, 13, 3,
			]
		),
	},
	{
		c: "ß",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				187, 5, 6, 10, 3, 12, 2, 4, 4, 4, 1, 4, 6, 3, 1, 3, 7, 7, 7, 3, 1, 3, 3, 7, 1, 3, 2, 7, 2, 3, 2, 8, 1, 3, 6, 8, 8, 6, 8, 6, 8, 6, 8,
				6, 1, 2, 4, 31, 1, 3, 3, 6,
			]
		),
	},
	{
		c: "ß",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				187, 5, 6, 10, 3, 12, 2, 4, 4, 4, 1, 4, 6, 3, 1, 3, 7, 7, 7, 3, 1, 3, 3, 7, 1, 3, 2, 7, 2, 3, 2, 8, 1, 3, 6, 8, 8, 6, 8, 6, 8, 6, 8,
				6, 1, 2, 4, 31, 1, 3, 3, 6,
			]
		),
	},
	{
		c: "à",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[
				159, 1, 1, 1, 11, 3, 10, 4, 10, 4, 10, 3, 19, 10, 2, 11, 2, 4, 4, 4, 1, 3, 6, 3, 10, 3, 2, 11, 1, 21, 1, 6, 7, 6, 7, 6, 7, 16, 1, 12,
				3, 5,
			]
		),
	},
	{
		c: "á",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				176, 1, 1, 1, 10, 4, 9, 4, 10, 3, 11, 2, 23, 9, 4, 11, 2, 4, 5, 3, 2, 3, 6, 4, 10, 4, 3, 11, 1, 13, 1, 7, 1, 5, 1, 3, 7, 6, 8, 3, 1,
				3, 6, 4, 1, 13, 1, 13, 4, 5, 2, 1,
			]
		),
	},
	{
		c: "â",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[161, 3, 9, 5, 8, 6, 6, 3, 1, 4, 5, 2, 3, 3, 17, 10, 2, 11, 2, 4, 4, 8, 6, 3, 10, 3, 2, 11, 1, 19, 3, 6, 7, 6, 7, 6, 7, 16, 1, 12, 3, 5]
		),
	},
	{
		c: "ã",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				178, 1, 6, 9, 5, 8, 6, 2, 2, 4, 22, 2, 9, 10, 4, 11, 2, 4, 4, 4, 2, 3, 7, 3, 10, 4, 3, 10, 2, 12, 2, 7, 2, 3, 2, 3, 7, 2, 1, 3, 8, 2,
				1, 4, 6, 3, 2, 12, 2, 13, 3, 6,
			]
		),
	},
	{
		c: "ä",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[172, 3, 2, 3, 5, 3, 2, 3, 5, 3, 2, 3, 30, 10, 2, 12, 1, 5, 1, 10, 6, 3, 10, 3, 2, 11, 1, 28, 7, 6, 7, 6, 6, 17, 1, 12, 3, 5]
		),
	},
	{
		c: "å",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				160, 2, 11, 4, 9, 3, 1, 2, 8, 2, 2, 2, 9, 5, 10, 3, 11, 1, 9, 10, 4, 11, 2, 4, 4, 4, 2, 3, 6, 4, 10, 4, 2, 12, 1, 13, 1, 17, 6, 7, 7,
				8, 6, 4, 1, 13, 1, 13, 3, 6,
			]
		),
	},
	{
		c: "æ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				362, 7, 2, 7, 3, 18, 1, 3, 5, 4, 4, 3, 1, 3, 5, 3, 6, 3, 8, 3, 6, 3, 2, 18, 1, 23, 4, 3, 9, 2, 6, 3, 9, 2, 6, 3, 6, 6, 5, 4, 5, 22, 2,
				18, 3, 6, 4, 4,
			]
		),
	},
	{
		c: "ç",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				254, 10, 3, 12, 2, 4, 4, 4, 2, 3, 7, 6, 8, 6, 11, 3, 11, 3, 11, 3, 8, 3, 1, 2, 8, 3, 1, 3, 6, 4, 1, 12, 3, 11, 5, 6, 9, 2, 12, 5, 12,
				2, 8, 6, 8, 5,
			]
		),
	},
	{
		c: "è",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				186, 4, 11, 3, 12, 3, 13, 1, 21, 10, 4, 11, 2, 4, 5, 4, 1, 3, 7, 3, 1, 3, 7, 35, 1, 1, 1, 1, 2, 1, 1, 1, 2, 3, 11, 3, 7, 3, 1, 3, 7,
				3, 1, 13, 2, 11, 5, 7,
			]
		),
	},
	{
		c: "é",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[189, 3, 10, 3, 10, 4, 10, 2, 23, 10, 3, 12, 1, 4, 6, 3, 1, 3, 7, 7, 8, 34, 2, 1, 3, 2, 3, 3, 11, 3, 8, 7, 6, 3, 2, 12, 2, 11, 6, 6]
		),
	},
	{
		c: "é",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				177, 2, 10, 4, 10, 3, 10, 3, 11, 3, 10, 4, 7, 11, 2, 13, 1, 5, 3, 5, 1, 3, 7, 7, 7, 45, 1, 3, 11, 3, 7, 3, 1, 3, 7, 3, 1, 13, 2, 11,
				5, 7,
			]
		),
	},
	{
		c: "ê",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[187, 5, 8, 6, 7, 4, 1, 3, 7, 2, 3, 2, 19, 10, 3, 12, 2, 4, 5, 8, 7, 6, 8, 48, 11, 3, 8, 3, 1, 3, 6, 4, 1, 12, 3, 11, 5, 7]
		),
	},
	{
		c: "ë",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[199, 3, 3, 2, 6, 3, 3, 2, 33, 10, 3, 12, 2, 3, 6, 4, 1, 2, 8, 6, 8, 35, 10, 3, 12, 2, 8, 3, 1, 3, 7, 3, 1, 12, 3, 11, 6, 5]
		),
	},
	{
		c: "î",
		data: ImageHelper.fromJsonBinarized(
			8,
			43,
			[106, 4, 3, 6, 1, 4, 1, 6, 3, 2, 11, 3, 5, 3, 5, 3, 4, 4, 4, 4, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3]
		),
	},
	{
		c: "ð",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				186, 5, 6, 11, 1, 1, 1, 13, 2, 1, 3, 8, 2, 12, 2, 4, 5, 3, 3, 7, 1, 3, 2, 12, 1, 13, 1, 3, 7, 3, 1, 3, 7, 7, 7, 6, 9, 6, 7, 3, 1, 3,
				7, 3, 1, 3, 7, 3, 1, 13, 2, 11, 5, 7,
			]
		),
	},
	{
		c: "ñ",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[165, 2, 5, 8, 4, 9, 4, 2, 2, 4, 29, 11, 2, 12, 1, 17, 5, 7, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 3, 10, 2]
		),
	},
	{
		c: "ò",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				171, 4, 10, 4, 11, 4, 11, 3, 12, 3, 9, 5, 6, 11, 3, 12, 1, 6, 2, 5, 1, 3, 7, 7, 7, 7, 8, 6, 8, 6, 8, 6, 7, 7, 7, 8, 6, 3, 1, 13, 2,
				12, 3, 9,
			]
		),
	},
	{
		c: "ó",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				175, 3, 10, 4, 9, 4, 10, 3, 11, 2, 11, 1, 1, 3, 6, 11, 2, 13, 1, 6, 2, 5, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 7, 7, 7, 7, 7, 7, 7, 7, 3,
				1, 4, 6, 3, 1, 13, 2, 12, 3, 9,
			]
		),
	},
	{
		c: "ô",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				186, 3, 11, 5, 10, 6, 8, 3, 1, 4, 7, 2, 3, 3, 8, 5, 7, 11, 3, 13, 2, 6, 2, 5, 2, 3, 7, 3, 2, 3, 7, 3, 2, 3, 7, 3, 1, 4, 7, 8, 7, 3, 2,
				3, 7, 3, 2, 3, 7, 3, 2, 4, 6, 3, 2, 13, 3, 11, 6, 8,
			]
		),
	},
	{
		c: "õ",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				173, 1, 4, 2, 5, 9, 5, 9, 5, 2, 2, 4, 22, 3, 1, 1, 6, 11, 2, 13, 1, 5, 4, 4, 1, 3, 7, 7, 7, 7, 7, 7, 7, 7, 7, 3, 1, 3, 7, 3, 1, 3, 7,
				3, 1, 3, 7, 3, 1, 13, 2, 11, 4, 9,
			]
		),
	},
	{
		c: "ö",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				185, 4, 1, 3, 6, 4, 1, 3, 6, 4, 1, 3, 24, 1, 8, 10, 3, 12, 2, 4, 5, 8, 7, 6, 8, 6, 8, 6, 8, 6, 8, 6, 8, 6, 8, 3, 1, 3, 7, 3, 1, 13, 2,
				11, 4, 8,
			]
		),
	},
	{ c: "÷", data: ImageHelper.fromJsonBinarized(16, 43, [246, 3, 13, 4, 12, 4, 12, 3, 39, 15, 1, 32, 39, 2, 13, 4, 12, 4, 12, 4, 13, 1]) },
	{
		c: "ø",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				235, 3, 7, 1, 2, 3, 3, 11, 2, 12, 1, 4, 4, 5, 1, 3, 5, 9, 4, 3, 1, 6, 3, 3, 2, 6, 3, 2, 3, 6, 2, 3, 3, 6, 1, 3, 4, 6, 1, 2, 5, 9, 4,
				3, 2, 12, 2, 12, 2, 10, 3, 3,
			]
		),
	},
	{
		c: "ù",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[172, 4, 10, 4, 10, 3, 11, 2, 18, 3, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 7, 5, 4, 1, 12, 2, 11, 4, 4]
		),
	},
	{
		c: "ú",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[176, 3, 9, 3, 9, 3, 10, 3, 19, 2, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 7, 6, 3, 1, 3, 5, 4, 1, 12, 2, 11, 4, 4]
		),
	},
	{
		c: "û",
		data: ImageHelper.fromJsonBinarized(
			12,
			43,
			[160, 4, 7, 6, 5, 3, 2, 3, 4, 2, 4, 2, 14, 3, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 16, 1, 11, 3, 4]
		),
	},
	{
		c: "ü",
		data: ImageHelper.fromJsonBinarized(
			12,
			43,
			[158, 3, 2, 3, 4, 3, 2, 3, 4, 3, 2, 3, 26, 3, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 5, 16, 1, 11, 4, 3]
		),
	},
	{
		c: "þ",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[
				182, 3, 10, 3, 10, 3, 10, 3, 2, 4, 4, 12, 1, 12, 1, 16, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 8, 3, 17, 1, 12, 1, 3, 3, 1, 1, 1, 4,
				3, 10, 3, 10, 3,
			]
		),
	},
	{
		c: "Ā",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				167, 8, 10, 8, 10, 8, 48, 4, 13, 6, 12, 6, 11, 7, 11, 3, 1, 4, 10, 3, 2, 3, 9, 4, 2, 4, 8, 3, 4, 3, 7, 4, 4, 4, 6, 3, 5, 4, 6, 3, 6,
				3, 5, 14, 4, 14, 3, 16, 2, 4, 8, 4, 2, 3, 10, 3, 1, 4, 10, 6, 14, 1,
			]
		),
	},
	{
		c: "ā",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[172, 7, 6, 8, 5, 8, 30, 10, 2, 11, 2, 4, 4, 4, 1, 3, 6, 3, 10, 3, 2, 11, 1, 28, 7, 6, 7, 6, 6, 17, 1, 12, 3, 5]
		),
	},
	{
		c: "Ă",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				149, 1, 16, 3, 4, 2, 9, 9, 10, 8, 11, 5, 14, 2, 15, 5, 13, 5, 13, 6, 11, 7, 11, 3, 1, 4, 9, 4, 2, 3, 9, 3, 3, 3, 8, 4, 3, 4, 7, 4, 4,
				3, 7, 3, 5, 4, 5, 4, 5, 4, 5, 13, 4, 15, 3, 15, 3, 3, 9, 4, 1, 4, 9, 4, 1, 3, 11, 4, 16, 1,
			]
		),
	},
	{
		c: "ă",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[159, 1, 11, 3, 4, 2, 4, 9, 5, 8, 6, 5, 10, 2, 7, 9, 3, 11, 1, 5, 4, 7, 7, 3, 10, 3, 2, 11, 1, 20, 2, 6, 7, 6, 7, 6, 6, 17, 1, 12, 3, 5]
		),
	},
	{
		c: "Ą",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				301, 5, 16, 5, 15, 6, 15, 7, 13, 4, 1, 3, 13, 3, 2, 4, 12, 3, 3, 3, 11, 4, 3, 3, 11, 3, 5, 3, 9, 4, 5, 3, 9, 4, 5, 4, 7, 14, 7, 15, 6,
				15, 5, 4, 9, 3, 5, 3, 10, 4, 3, 4, 11, 3, 5, 1, 12, 3, 18, 2, 18, 3, 18, 7, 15, 6, 16, 4,
			]
		),
	},
	{
		c: "ą",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				290, 10, 5, 11, 5, 4, 4, 4, 4, 3, 6, 3, 13, 3, 5, 11, 4, 12, 3, 6, 4, 3, 3, 3, 7, 3, 3, 3, 7, 3, 3, 3, 6, 4, 3, 13, 4, 12, 6, 5, 3, 3,
				13, 2, 13, 3, 13, 6, 11, 5, 13, 2,
			]
		),
	},
	{
		c: "Ć",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				170, 4, 13, 4, 13, 4, 14, 3, 14, 8, 8, 13, 4, 14, 3, 7, 3, 6, 2, 4, 8, 4, 1, 4, 10, 8, 10, 8, 14, 4, 14, 4, 14, 4, 14, 4, 11, 2, 1, 4,
				10, 8, 10, 4, 1, 3, 10, 3, 2, 5, 6, 5, 2, 16, 3, 14, 6, 10,
			]
		),
	},
	{
		c: "ć",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[175, 3, 9, 3, 9, 4, 11, 1, 21, 10, 2, 11, 1, 5, 4, 7, 7, 6, 7, 6, 10, 3, 10, 3, 10, 3, 7, 6, 7, 6, 7, 16, 1, 11, 4, 7]
		),
	},
	{
		c: "ċ",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[175, 3, 9, 4, 10, 3, 32, 10, 2, 17, 4, 7, 7, 6, 8, 5, 10, 3, 10, 3, 10, 3, 8, 5, 7, 7, 6, 3, 1, 12, 1, 11, 5, 6]
		),
	},
	{
		c: "č",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				171, 2, 3, 3, 6, 3, 1, 4, 7, 6, 9, 4, 35, 10, 3, 12, 2, 4, 4, 4, 1, 4, 6, 7, 8, 6, 11, 3, 11, 3, 11, 3, 8, 6, 8, 7, 6, 3, 2, 12, 3,
				10, 6, 6,
			]
		),
	},
	{
		c: "Ē",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[144, 1, 9, 8, 7, 8, 33, 14, 1, 14, 1, 14, 1, 3, 12, 3, 12, 3, 12, 4, 11, 13, 2, 13, 2, 13, 2, 3, 12, 3, 12, 4, 11, 3, 12, 4, 11, 30]
		),
	},
	{
		c: "ē",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[185, 8, 6, 9, 5, 9, 21, 4, 7, 11, 2, 13, 1, 5, 1, 1, 1, 9, 7, 7, 7, 49, 10, 4, 7, 3, 1, 3, 6, 4, 1, 13, 2, 11, 5, 8]
		),
	},
	{
		c: "Ę",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				196, 45, 11, 3, 11, 3, 11, 3, 11, 13, 1, 13, 1, 13, 1, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 28, 4, 3, 11, 3, 11, 2, 12, 3, 1, 2, 8, 6,
				10, 2,
			]
		),
	},
	{
		c: "ę",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[242, 5, 7, 10, 3, 12, 1, 5, 3, 10, 6, 7, 7, 49, 11, 3, 7, 8, 6, 4, 1, 12, 2, 12, 4, 9, 6, 3, 11, 3, 11, 6, 8, 6, 9, 4]
		),
	},
	{
		c: "Ě",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				138, 3, 2, 3, 8, 7, 9, 5, 11, 3, 21, 14, 1, 14, 1, 14, 1, 4, 11, 4, 11, 4, 11, 4, 11, 14, 1, 14, 1, 14, 1, 4, 11, 4, 11, 4, 11, 4, 11,
				4, 11, 30,
			]
		),
	},
	{
		c: "ě",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				172, 1, 4, 1, 6, 4, 1, 4, 6, 7, 8, 5, 10, 3, 10, 4, 1, 1, 5, 11, 2, 13, 1, 5, 3, 5, 1, 3, 7, 3, 1, 3, 7, 45, 1, 3, 11, 3, 7, 8, 5, 4,
				1, 13, 2, 11, 5, 8,
			]
		),
	},
	{
		c: "Ġ",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				161, 3, 14, 3, 14, 3, 28, 7, 8, 12, 4, 14, 2, 5, 6, 5, 1, 3, 10, 3, 1, 3, 10, 7, 10, 7, 13, 4, 13, 4, 4, 13, 4, 13, 4, 2, 1, 10, 10,
				3, 1, 3, 10, 3, 1, 3, 10, 3, 1, 4, 8, 4, 1, 16, 2, 14, 6, 8,
			]
		),
	},
	{
		c: "ġ",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				202, 3, 12, 3, 12, 3, 25, 4, 4, 2, 2, 13, 1, 14, 1, 4, 5, 4, 2, 3, 7, 3, 2, 3, 7, 3, 2, 13, 3, 11, 4, 10, 4, 3, 12, 12, 3, 13, 2, 17,
				9, 6, 9, 18, 1, 14, 2, 11,
			]
		),
	},
	{
		c: "Ģ",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				240, 7, 8, 13, 4, 15, 2, 6, 5, 5, 2, 4, 9, 3, 2, 3, 10, 4, 1, 3, 11, 3, 1, 3, 15, 3, 14, 4, 4, 14, 4, 10, 1, 3, 6, 3, 1, 4, 1, 3, 10,
				4, 1, 3, 10, 4, 1, 3, 10, 4, 1, 4, 8, 4, 3, 15, 3, 14, 7, 8, 12, 4, 14, 4, 16, 2, 14, 4, 14, 2,
			]
		),
	},
	{
		c: "Ħ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				296, 4, 9, 4, 3, 19, 1, 42, 2, 4, 4, 3, 2, 4, 4, 4, 9, 4, 4, 4, 9, 4, 4, 17, 4, 17, 4, 17, 4, 4, 9, 4, 4, 4, 9, 4, 4, 4, 9, 4, 4, 4,
				9, 4, 4, 4, 9, 4, 4, 4, 9, 4, 4, 4, 9, 4,
			]
		),
	},
	{
		c: "ħ",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				197, 3, 10, 10, 4, 10, 5, 3, 3, 3, 5, 3, 1, 7, 3, 12, 2, 6, 1, 6, 1, 4, 6, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7,
				3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 3,
			]
		),
	},
	{
		c: "į",
		data: ImageHelper.fromJsonBinarized(
			6,
			43,
			[84, 4, 2, 4, 2, 3, 10, 2, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 4, 2, 3, 3, 4, 2, 3, 3, 3, 2, 4, 2, 4, 12, 2, 2]
		),
	},
	{ c: "ı", data: ImageHelper.fromJsonBinarized(3, 43, [54, 39, 1, 1]) },
	{
		c: "ķ",
		data: ImageHelper.fromJsonBinarized(
			12,
			43,
			[
				168, 3, 9, 3, 9, 3, 9, 3, 9, 3, 5, 3, 1, 3, 4, 4, 1, 3, 3, 4, 2, 3, 2, 4, 3, 3, 1, 4, 4, 7, 5, 6, 6, 3, 1, 3, 5, 3, 2, 3, 4, 3, 2, 4,
				3, 3, 3, 4, 2, 3, 4, 4, 1, 3, 5, 4, 15, 4, 8, 4, 10, 2, 9, 3, 9, 1,
			]
		),
	},
	{
		c: "ł",
		data: ImageHelper.fromJsonBinarized(
			8,
			43,
			[114, 4, 4, 3, 5, 4, 4, 4, 4, 4, 4, 3, 2, 1, 2, 6, 2, 6, 2, 4, 3, 5, 2, 6, 3, 4, 5, 4, 4, 4, 4, 3, 5, 3, 5, 3]
		),
	},
	{
		c: "Ń",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				152, 3, 12, 3, 12, 3, 13, 3, 23, 5, 8, 8, 8, 9, 7, 9, 7, 6, 1, 3, 6, 6, 1, 4, 5, 6, 2, 3, 5, 6, 2, 4, 4, 6, 3, 3, 4, 6, 3, 4, 3, 6, 4,
				4, 2, 6, 5, 3, 2, 6, 5, 4, 1, 6, 6, 3, 1, 6, 6, 10, 7, 9, 8, 5,
			]
		),
	},
	{
		c: "ń",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[163, 3, 10, 3, 9, 3, 9, 4, 9, 3, 18, 3, 1, 8, 1, 30, 6, 7, 6, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 3, 1, 2, 8, 2]
		),
	},
	{
		c: "Ņ",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				224, 5, 7, 9, 7, 10, 6, 10, 6, 7, 1, 3, 5, 7, 1, 4, 4, 7, 2, 3, 4, 7, 2, 4, 3, 7, 3, 3, 3, 7, 3, 4, 2, 7, 4, 4, 2, 6, 5, 3, 2, 6, 5,
				4, 1, 6, 6, 3, 1, 6, 6, 10, 7, 9, 8, 5, 22, 4, 12, 4, 13, 3, 12, 3, 13, 2,
			]
		),
	},
	{
		c: "ņ",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[234, 12, 1, 30, 5, 8, 6, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 4, 1, 1, 8, 2, 4, 4, 9, 4, 11, 2, 10, 3, 10, 2]
		),
	},
	{
		c: "Ň",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				148, 3, 2, 3, 9, 6, 10, 5, 12, 4, 22, 4, 8, 9, 7, 10, 6, 6, 1, 3, 6, 6, 2, 3, 5, 6, 2, 3, 5, 6, 2, 4, 4, 6, 3, 4, 3, 7, 3, 3, 3, 6, 4,
				4, 2, 7, 4, 3, 2, 7, 4, 4, 2, 6, 5, 3, 2, 6, 6, 3, 1, 5, 7, 10, 7, 9, 7, 6,
			]
		),
	},
	{
		c: "ň",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[
				158, 3, 3, 3, 5, 3, 1, 4, 6, 6, 7, 5, 11, 1, 11, 1, 6, 12, 1, 12, 1, 17, 5, 7, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 5,
				8, 3,
			]
		),
	},
	{
		c: "Ő",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				169, 3, 1, 4, 9, 3, 2, 3, 9, 3, 2, 3, 10, 3, 2, 2, 12, 6, 9, 13, 4, 14, 3, 5, 6, 5, 2, 3, 10, 3, 1, 4, 10, 8, 10, 8, 10, 8, 10, 8, 10,
				8, 10, 8, 10, 8, 10, 8, 10, 4, 1, 3, 10, 3, 2, 4, 8, 4, 2, 15, 4, 14, 6, 9,
			]
		),
	},
	{
		c: "Œ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				265, 2, 15, 18, 1, 19, 1, 4, 3, 12, 1, 3, 5, 4, 7, 3, 6, 4, 7, 3, 6, 4, 7, 3, 6, 4, 7, 3, 6, 10, 1, 3, 6, 10, 1, 3, 6, 10, 1, 3, 6, 4,
				7, 3, 6, 4, 7, 3, 6, 4, 7, 4, 5, 4, 8, 3, 5, 4, 8, 19, 2, 18, 4, 4,
			]
		),
	},
	{
		c: "œ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				362, 7, 2, 7, 3, 18, 2, 3, 4, 5, 3, 4, 1, 2, 5, 4, 5, 6, 6, 2, 6, 6, 6, 14, 6, 14, 6, 3, 2, 2, 4, 3, 6, 2, 9, 3, 6, 2, 6, 3, 1, 2, 5,
				4, 5, 3, 1, 19, 1, 18, 4, 5, 4, 6,
			]
		),
	},
	{
		c: "Ŕ",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				161, 3, 13, 3, 13, 4, 13, 3, 25, 14, 3, 15, 2, 16, 1, 3, 9, 4, 1, 3, 10, 3, 1, 3, 10, 3, 1, 3, 9, 4, 1, 4, 7, 5, 1, 15, 2, 14, 3, 4,
				1, 10, 2, 3, 9, 3, 2, 3, 9, 4, 1, 3, 10, 3, 1, 3, 10, 3, 1, 3, 10, 3, 1, 3, 10, 7, 11, 3,
			]
		),
	},
	{
		c: "Ř",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				157, 3, 2, 3, 10, 7, 11, 5, 13, 3, 24, 14, 3, 15, 2, 8, 1, 7, 1, 3, 9, 4, 1, 3, 10, 3, 1, 3, 10, 3, 1, 3, 9, 4, 1, 4, 7, 4, 2, 15, 2,
				14, 3, 5, 3, 1, 1, 5, 2, 3, 9, 3, 2, 3, 9, 4, 1, 3, 9, 4, 1, 3, 10, 3, 1, 3, 10, 3, 1, 3, 10, 7, 10, 4,
			]
		),
	},
	{
		c: "Ś",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				152, 3, 12, 3, 12, 3, 13, 3, 12, 6, 7, 12, 3, 14, 2, 4, 6, 4, 1, 4, 8, 3, 1, 3, 10, 6, 13, 4, 13, 12, 5, 13, 7, 10, 12, 4, 13, 6, 10,
				7, 9, 3, 1, 3, 8, 4, 1, 15, 2, 13, 5, 8,
			]
		),
	},
	{
		c: "ś",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[163, 3, 9, 4, 9, 3, 9, 3, 10, 2, 12, 1, 8, 10, 2, 11, 2, 3, 5, 7, 7, 7, 10, 9, 4, 11, 4, 10, 10, 6, 7, 7, 6, 3, 1, 12, 1, 11, 4, 7]
		),
	},
	{
		c: "Ş",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				213, 6, 7, 12, 3, 14, 1, 5, 5, 5, 1, 3, 9, 3, 1, 3, 9, 3, 1, 3, 13, 4, 13, 12, 4, 14, 7, 9, 13, 4, 13, 6, 10, 6, 10, 7, 8, 4, 1, 14,
				3, 13, 5, 8, 10, 4, 12, 5, 14, 2, 10, 6, 12, 2,
			]
		),
	},
	{
		c: "ş",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[226, 4, 6, 10, 2, 12, 1, 4, 4, 8, 6, 7, 10, 10, 3, 11, 4, 10, 10, 6, 7, 7, 6, 3, 1, 12, 1, 12, 3, 7, 8, 4, 9, 5, 11, 2, 7, 6, 7, 5]
		),
	},
	{
		c: "Š",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				148, 3, 2, 3, 9, 6, 11, 5, 12, 3, 12, 5, 7, 12, 3, 14, 1, 6, 5, 4, 1, 4, 8, 7, 9, 8, 12, 5, 12, 12, 5, 13, 6, 11, 12, 4, 13, 7, 9, 7,
				9, 7, 8, 4, 1, 15, 2, 13, 5, 9,
			]
		),
	},
	{
		c: "š",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				171, 1, 6, 1, 6, 3, 2, 3, 7, 6, 8, 5, 10, 3, 22, 10, 3, 12, 2, 4, 4, 4, 2, 3, 6, 3, 2, 3, 11, 10, 5, 11, 5, 9, 11, 3, 2, 3, 7, 7, 6,
				4, 1, 12, 2, 12, 4, 8,
			]
		),
	},
	{
		c: "ţ",
		data: ImageHelper.fromJsonBinarized(
			10,
			43,
			[143, 3, 7, 3, 7, 3, 7, 3, 4, 30, 3, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 4, 6, 7, 4, 6, 6, 4, 4, 4, 6, 4, 8, 2, 7, 3, 6, 3]
		),
	},
	{
		c: "Ť",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				149, 2, 2, 2, 11, 5, 11, 4, 13, 2, 23, 32, 6, 5, 12, 2, 14, 2, 14, 2, 14, 2, 14, 2, 14, 2, 14, 2, 14, 2, 14, 2, 14, 2, 14, 2, 14, 2,
				14, 2, 14, 2,
			]
		),
	},
	{
		c: "ū",
		data: ImageHelper.fromJsonBinarized(
			12,
			43,
			[163, 2, 5, 8, 4, 8, 26, 3, 7, 5, 6, 6, 7, 5, 7, 5, 7, 5, 6, 6, 7, 5, 7, 5, 6, 6, 6, 7, 5, 15, 1, 11, 4, 4]
		),
	},
	{
		c: "ů",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[149, 1, 10, 4, 9, 2, 1, 2, 8, 1, 2, 2, 8, 5, 9, 3, 18, 3, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 7, 6, 6, 8, 4, 18, 1, 12, 3, 4]
		),
	},
	{
		c: "ż",
		data: ImageHelper.fromJsonBinarized(
			12,
			43,
			[161, 3, 9, 3, 9, 3, 28, 24, 1, 11, 7, 4, 7, 4, 7, 4, 7, 4, 7, 4, 7, 4, 7, 4, 7, 4, 8, 24, 2, 1, 2, 1]
		),
	},
	{
		c: "ž",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[172, 3, 1, 3, 7, 6, 7, 5, 9, 3, 19, 11, 2, 12, 1, 11, 9, 4, 8, 4, 8, 4, 8, 4, 8, 4, 8, 4, 8, 3, 9, 4, 8, 26]
		),
	},
	{
		c: "ƒ",
		data: ImageHelper.fromJsonBinarized(
			12,
			43,
			[164, 4, 7, 5, 6, 6, 6, 3, 9, 3, 9, 2, 6, 9, 3, 9, 3, 9, 6, 3, 9, 3, 9, 2, 9, 3, 9, 3, 9, 3, 9, 3, 9, 2, 9, 3, 9, 3, 6, 6, 6, 5, 7, 4]
		),
	},
	{
		c: "Ǧ",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				157, 3, 4, 2, 8, 9, 9, 8, 10, 5, 12, 6, 7, 13, 3, 15, 2, 5, 6, 9, 10, 7, 10, 7, 10, 6, 14, 3, 14, 3, 5, 12, 5, 12, 5, 2, 2, 9, 10, 7,
				10, 7, 10, 3, 1, 4, 8, 4, 1, 15, 3, 14, 6, 8,
			]
		),
	},
	{
		c: "ǧ",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				184, 1, 5, 1, 7, 3, 3, 3, 6, 9, 7, 8, 8, 5, 10, 4, 4, 2, 1, 14, 1, 14, 1, 3, 6, 4, 1, 4, 6, 4, 1, 4, 6, 4, 2, 12, 3, 12, 3, 11, 4, 3,
				12, 11, 4, 13, 1, 14, 1, 3, 8, 7, 8, 18, 1, 14, 2, 12,
			]
		),
	},
	{
		c: "Γ",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[182, 42, 10, 3, 10, 3, 10, 3, 10, 3, 10, 3, 10, 3, 10, 3, 10, 3, 10, 3, 10, 3, 10, 3, 10, 3, 10, 3, 10, 2]
		),
	},
	{
		c: "Δ",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				259, 4, 13, 5, 13, 6, 11, 7, 11, 3, 1, 4, 10, 3, 2, 3, 9, 3, 3, 4, 8, 3, 4, 3, 7, 4, 4, 3, 7, 3, 5, 4, 6, 3, 6, 3, 5, 3, 7, 3, 5, 3,
				8, 3, 3, 3, 9, 3, 3, 3, 9, 4, 1, 17, 1, 18, 1, 1,
			]
		),
	},
	{
		c: "Θ",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				240, 6, 9, 13, 4, 15, 2, 6, 5, 5, 2, 4, 9, 4, 1, 3, 10, 4, 1, 3, 11, 7, 11, 7, 1, 8, 2, 7, 1, 8, 2, 3, 1, 3, 1, 8, 2, 3, 1, 3, 11, 3,
				1, 3, 11, 3, 1, 3, 11, 3, 1, 3, 10, 3, 2, 4, 8, 4, 2, 16, 3, 14, 7, 9,
			]
		),
	},
	{
		c: "Λ",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				244, 5, 12, 5, 12, 5, 11, 7, 10, 3, 1, 3, 9, 4, 1, 4, 8, 3, 3, 3, 7, 4, 3, 3, 7, 4, 3, 4, 6, 3, 5, 3, 5, 4, 5, 4, 4, 3, 7, 3, 3, 4, 7,
				3, 3, 4, 8, 3, 2, 3, 9, 3, 1, 4, 9, 7, 11, 3,
			]
		),
	},
	{ c: "Ξ", data: ImageHelper.fromJsonBinarized(16, 43, [224, 15, 1, 15, 1, 15, 66, 13, 3, 13, 3, 13, 68, 1, 2, 10, 1, 32]) },
	{
		c: "Π",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				252, 54, 2, 4, 6, 3, 5, 4, 6, 3, 6, 3, 6, 3, 6, 2, 7, 3, 5, 4, 6, 3, 5, 4, 6, 3, 6, 3, 6, 3, 5, 4, 6, 3, 6, 3, 6, 3, 6, 3, 6, 3, 5, 4,
				6, 3, 6, 3, 6, 3, 6, 2, 7, 3, 5, 4, 6, 3,
			]
		),
	},
	{
		c: "Σ",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[225, 15, 1, 15, 1, 14, 3, 5, 13, 5, 13, 5, 12, 5, 13, 4, 13, 3, 12, 4, 11, 4, 10, 5, 9, 5, 9, 5, 10, 5, 10, 32, 1, 1]
		),
	},
	{
		c: "Φ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				274, 3, 12, 11, 6, 15, 3, 17, 2, 4, 3, 3, 3, 4, 2, 3, 4, 3, 4, 3, 1, 4, 4, 3, 4, 3, 1, 4, 4, 3, 4, 8, 4, 3, 4, 8, 4, 3, 4, 8, 4, 3, 4,
				4, 1, 3, 4, 3, 4, 3, 2, 3, 4, 3, 4, 3, 2, 17, 3, 15, 5, 13, 11, 3,
			]
		),
	},
	{
		c: "Ψ",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				238, 3, 4, 3, 4, 6, 4, 3, 4, 6, 4, 3, 4, 6, 4, 3, 4, 6, 4, 3, 4, 6, 4, 3, 4, 6, 4, 3, 4, 6, 4, 3, 4, 6, 4, 3, 4, 7, 3, 3, 3, 9, 2, 3,
				2, 5, 1, 15, 3, 13, 6, 8, 12, 3, 14, 3, 14, 3,
			]
		),
	},
	{
		c: "Ω",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				241, 6, 7, 13, 4, 15, 3, 4, 8, 4, 1, 4, 10, 3, 1, 3, 11, 3, 1, 3, 11, 3, 1, 3, 11, 3, 1, 3, 11, 3, 1, 3, 11, 3, 1, 3, 11, 3, 2, 3, 10,
				3, 2, 3, 9, 4, 2, 4, 7, 4, 4, 4, 5, 4, 6, 4, 3, 5, 3, 8, 2, 16, 2, 8,
			]
		),
	},
	{
		c: "α",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				295, 3, 12, 7, 2, 3, 4, 9, 1, 3, 3, 4, 3, 7, 2, 4, 5, 5, 3, 4, 5, 5, 3, 3, 6, 5, 3, 3, 6, 4, 3, 4, 6, 4, 3, 4, 6, 4, 4, 3, 5, 5, 4, 4,
				2, 8, 3, 10, 1, 5, 2, 8, 2, 4, 5, 4, 6, 1,
			]
		),
	},
	{
		c: "α",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				295, 3, 12, 7, 2, 3, 4, 9, 1, 3, 3, 4, 3, 7, 2, 4, 5, 5, 3, 4, 5, 5, 3, 3, 6, 5, 3, 3, 6, 4, 3, 4, 6, 4, 3, 4, 6, 4, 4, 3, 5, 5, 4, 4,
				2, 8, 3, 10, 1, 5, 2, 8, 2, 4, 5, 4, 6, 1,
			]
		),
	},
	{
		c: "β",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				230, 8, 7, 10, 5, 4, 4, 4, 4, 3, 6, 3, 3, 4, 6, 3, 3, 3, 6, 4, 3, 3, 5, 4, 4, 3, 2, 6, 4, 4, 2, 5, 5, 4, 4, 5, 3, 3, 7, 3, 3, 3, 7, 3,
				3, 3, 7, 3, 3, 3, 7, 3, 2, 4, 6, 4, 2, 13, 3, 12, 4, 3, 2, 4, 7, 3, 13, 3, 12, 4, 13, 1,
			]
		),
	},
	{
		c: "γ",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				271, 3, 8, 9, 5, 4, 2, 4, 5, 3, 4, 4, 4, 3, 5, 4, 2, 3, 6, 4, 2, 3, 7, 3, 1, 4, 7, 3, 1, 3, 8, 7, 9, 5, 10, 5, 10, 4, 11, 4, 11, 3,
				11, 4, 11, 4, 10, 4,
			]
		),
	},
	{
		c: "δ",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				214, 11, 4, 11, 4, 5, 12, 4, 12, 5, 7, 9, 4, 5, 2, 5, 3, 3, 5, 4, 2, 3, 7, 3, 2, 3, 7, 3, 1, 4, 7, 3, 1, 4, 7, 3, 1, 4, 6, 4, 1, 4, 6,
				3, 3, 3, 5, 4, 3, 11, 5, 9, 8, 5,
			]
		),
	},
	{
		c: "ε",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[228, 1, 8, 9, 3, 11, 1, 5, 3, 4, 1, 4, 10, 3, 10, 8, 5, 8, 4, 9, 3, 4, 9, 3, 10, 4, 4, 4, 1, 13, 1, 11, 3, 8]
		),
	},
	{
		c: "ε",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[228, 1, 8, 9, 3, 11, 1, 5, 3, 4, 1, 4, 10, 3, 10, 8, 5, 8, 4, 9, 3, 4, 9, 3, 10, 4, 4, 4, 1, 13, 1, 11, 3, 8]
		),
	},
	{
		c: "ζ",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				213, 12, 3, 12, 7, 6, 8, 5, 9, 4, 10, 4, 10, 4, 10, 4, 10, 4, 11, 3, 11, 4, 11, 3, 12, 3, 12, 3, 6, 1, 5, 12, 3, 12, 4, 11, 7, 1, 3,
				3, 11, 4, 10, 4, 11, 4, 12, 2,
			]
		),
	},
	{
		c: "η",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				253, 3, 2, 6, 2, 13, 2, 13, 2, 4, 4, 4, 2, 3, 5, 4, 2, 3, 5, 4, 2, 3, 5, 3, 2, 4, 5, 3, 2, 3, 6, 3, 2, 3, 6, 3, 2, 3, 6, 3, 2, 3, 5,
				4, 2, 3, 5, 4, 10, 4, 10, 3, 11, 3, 11, 3,
			]
		),
	},
	{
		c: "θ",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				188, 5, 8, 8, 4, 10, 4, 3, 4, 4, 2, 3, 6, 3, 1, 4, 6, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 13, 1, 20, 1, 10, 6, 8, 6, 3, 1, 4, 6, 3, 2, 3, 5,
				4, 2, 4, 3, 4, 3, 10, 5, 8, 8, 2,
			]
		),
	},
	{ c: "ι", data: ImageHelper.fromJsonBinarized(5, 43, [91, 4, 1, 3, 2, 3, 2, 3, 2, 3, 2, 3, 1, 3, 2, 3, 2, 3, 2, 3, 2, 4, 1, 10, 3, 1]) },
	{
		c: "κ",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[
				236, 3, 4, 4, 2, 2, 4, 4, 3, 2, 3, 4, 3, 3, 2, 4, 4, 3, 1, 4, 5, 7, 6, 8, 5, 8, 4, 5, 2, 3, 3, 4, 3, 3, 3, 3, 4, 4, 2, 3, 5, 8, 5, 4,
				11, 1,
			]
		),
	},
	{
		c: "λ",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				199, 6, 8, 6, 10, 5, 10, 4, 11, 3, 11, 3, 10, 5, 8, 6, 8, 6, 7, 8, 5, 4, 1, 4, 5, 4, 1, 4, 4, 4, 2, 4, 3, 5, 3, 4, 2, 4, 4, 10, 4, 9,
				6, 7, 9, 2,
			]
		),
	},
	{
		c: "μ",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				272, 3, 6, 3, 3, 3, 6, 3, 3, 3, 6, 3, 3, 3, 6, 3, 3, 3, 5, 4, 3, 3, 5, 4, 2, 3, 6, 3, 3, 3, 6, 3, 3, 3, 6, 3, 3, 3, 5, 4, 3, 5, 2, 5,
				1, 25, 1, 4, 1, 3, 10, 1, 1, 3, 12, 3, 12, 3,
			]
		),
	},
	{
		c: "ν",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				252, 3, 7, 7, 7, 3, 2, 2, 6, 4, 2, 3, 5, 3, 3, 3, 4, 4, 3, 3, 4, 3, 4, 4, 2, 3, 5, 4, 2, 3, 6, 3, 1, 3, 7, 3, 1, 3, 7, 6, 8, 6, 9, 4,
				10, 1,
			]
		),
	},
	{
		c: "ξ",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[
				184, 11, 1, 12, 2, 9, 4, 4, 9, 4, 9, 3, 10, 5, 8, 9, 4, 9, 4, 8, 4, 4, 8, 4, 9, 3, 10, 4, 6, 2, 1, 26, 1, 12, 4, 8, 9, 4, 7, 5, 9, 4,
				10, 1,
			]
		),
	},
	{
		c: "ο",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[244, 4, 7, 9, 5, 10, 3, 4, 3, 4, 2, 4, 5, 4, 1, 3, 7, 7, 7, 6, 8, 6, 7, 7, 7, 3, 1, 4, 5, 4, 1, 5, 3, 4, 3, 10, 5, 8, 8, 3]
		),
	},
	{
		c: "π",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				270, 30, 1, 13, 2, 4, 4, 3, 4, 4, 4, 3, 4, 3, 5, 3, 4, 3, 4, 3, 5, 3, 4, 3, 4, 4, 4, 3, 4, 4, 4, 3, 4, 3, 5, 4, 3, 3, 5, 5, 2, 3, 5,
				5, 13, 1,
			]
		),
	},
	{
		c: "ρ",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				264, 1, 10, 8, 6, 10, 4, 4, 4, 4, 3, 3, 5, 4, 2, 4, 6, 3, 2, 3, 7, 3, 2, 3, 7, 3, 2, 3, 7, 3, 1, 4, 6, 3, 2, 4, 6, 3, 2, 5, 4, 4, 2,
				12, 3, 3, 1, 7, 4, 3, 3, 1, 7, 4, 11, 4, 11, 3,
			]
		),
	},
	{
		c: "σ",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				292, 12, 3, 13, 2, 3, 4, 5, 3, 4, 5, 3, 4, 3, 6, 3, 3, 3, 7, 3, 3, 3, 7, 3, 3, 3, 7, 3, 3, 3, 7, 3, 3, 3, 6, 4, 3, 4, 4, 4, 5, 10, 7,
				8, 11, 1,
			]
		),
	},
	{ c: "τ", data: ImageHelper.fromJsonBinarized(11, 43, [198, 22, 3, 5, 6, 3, 8, 3, 8, 3, 8, 3, 7, 4, 7, 3, 8, 3, 8, 5, 6, 6, 6, 5, 9, 1]) },
	{
		c: "υ",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				254, 3, 6, 3, 2, 3, 6, 3, 1, 4, 5, 3, 2, 3, 6, 3, 2, 3, 6, 3, 2, 3, 6, 3, 2, 3, 5, 4, 2, 3, 5, 4, 1, 4, 5, 3, 2, 4, 5, 3, 3, 4, 2, 5,
				3, 10, 5, 8,
			]
		),
	},
	{
		c: "φ",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				217, 3, 12, 3, 12, 3, 12, 3, 10, 7, 6, 10, 4, 12, 2, 4, 1, 3, 2, 8, 2, 3, 3, 6, 3, 3, 3, 6, 3, 3, 3, 6, 3, 3, 3, 6, 3, 2, 3, 3, 1, 3,
				2, 3, 3, 3, 1, 4, 1, 3, 2, 3, 2, 13, 3, 10, 7, 6, 10, 4, 11, 4, 11, 3,
			]
		),
	},
	{
		c: "χ",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[
				224, 1, 11, 4, 4, 3, 2, 5, 3, 3, 4, 3, 2, 3, 5, 3, 2, 3, 6, 6, 7, 5, 8, 5, 8, 4, 9, 4, 9, 4, 8, 6, 6, 7, 5, 4, 1, 3, 5, 3, 2, 3, 4, 3,
				4, 4, 1, 4, 4, 4, 1, 3, 6, 3,
			]
		),
	},
	{
		c: "ψ",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				231, 4, 12, 4, 12, 3, 13, 3, 7, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 1, 3, 2, 4, 2, 4, 1, 3, 2, 4, 2, 8, 2, 3, 3, 3, 1, 3, 3, 3, 3, 3, 1,
				3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 1, 3, 3, 3, 2, 4, 1, 3, 2, 4, 2, 4, 1, 4, 1, 4, 1, 4, 2, 13, 5, 10, 8, 5, 11, 4, 12, 4, 12, 3,
			]
		),
	},
	{
		c: "ω",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				346, 2, 9, 2, 5, 4, 7, 3, 4, 4, 8, 4, 3, 3, 10, 3, 2, 3, 4, 3, 4, 4, 1, 3, 4, 3, 5, 7, 4, 3, 5, 7, 4, 3, 4, 8, 3, 4, 4, 8, 3, 4, 4, 3,
				2, 11, 1, 5, 2, 7, 1, 8, 4, 5, 3, 6,
			]
		),
	},
	{
		c: "ώ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				218, 3, 16, 3, 16, 3, 16, 3, 16, 2, 17, 2, 31, 2, 9, 2, 5, 4, 7, 4, 3, 5, 7, 4, 3, 4, 9, 4, 1, 4, 4, 2, 4, 4, 1, 3, 4, 3, 5, 7, 4, 3,
				5, 7, 4, 3, 4, 8, 4, 3, 4, 8, 3, 4, 3, 4, 2, 4, 1, 6, 1, 5, 2, 7, 1, 8, 4, 6, 2, 6,
			]
		),
	},
	{
		c: "ϒ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				264, 3, 6, 4, 5, 7, 2, 7, 3, 18, 2, 3, 2, 8, 2, 8, 4, 4, 5, 3, 1, 2, 5, 4, 5, 3, 8, 4, 16, 4, 17, 3, 16, 4, 16, 4, 17, 3, 17, 3, 16,
				4, 16, 4, 16, 4, 16, 4, 17, 3,
			]
		),
	},
	{
		c: "Д",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				252, 12, 6, 13, 6, 13, 6, 3, 7, 3, 6, 3, 7, 3, 6, 3, 7, 3, 6, 3, 7, 3, 6, 3, 7, 3, 6, 3, 7, 3, 6, 3, 7, 3, 6, 3, 7, 3, 5, 3, 8, 3, 5,
				3, 8, 3, 4, 4, 8, 3, 4, 4, 8, 3, 3, 4, 9, 3, 2, 41, 12, 7, 13, 6, 13, 3,
			]
		),
	},
	{
		c: "Ж",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				295, 3, 5, 3, 5, 3, 2, 3, 5, 3, 4, 4, 2, 4, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 4, 3, 3, 3, 4, 5, 4, 2, 3, 2, 4, 7, 13,
				8, 13, 8, 3, 2, 3, 2, 3, 8, 3, 2, 3, 2, 3, 7, 3, 3, 3, 3, 3, 6, 3, 3, 3, 3, 3, 5, 3, 4, 3, 4, 3, 3, 4, 4, 3, 4, 4, 2, 3, 5, 3, 4, 4,
				1, 4, 5, 3, 5, 4,
			]
		),
	},
	{
		skip: true,
		c: "З",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[200, 6, 6, 12, 2, 19, 6, 7, 9, 6, 9, 3, 12, 3, 11, 4, 4, 10, 5, 10, 10, 6, 12, 3, 12, 6, 9, 6, 9, 7, 8, 18, 1, 13, 5, 7]
		),
	},
	{
		c: "И",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				210, 2, 8, 7, 8, 7, 7, 8, 7, 8, 6, 9, 6, 3, 1, 5, 5, 3, 2, 5, 4, 3, 3, 5, 4, 3, 3, 5, 3, 3, 4, 5, 2, 4, 4, 5, 2, 3, 5, 5, 1, 3, 6, 8,
				7, 8, 7, 7, 8, 7, 8, 3,
			]
		),
	},
	{
		c: "Й",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				164, 2, 4, 2, 9, 7, 9, 6, 21, 3, 8, 8, 8, 8, 7, 9, 6, 10, 6, 3, 1, 6, 5, 4, 1, 6, 5, 3, 2, 6, 4, 4, 2, 6, 4, 3, 3, 6, 3, 4, 3, 6, 2,
				4, 4, 6, 2, 3, 5, 6, 1, 4, 5, 10, 6, 10, 6, 9, 7, 8, 8, 3,
			]
		),
	},
	{
		c: "К",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				225, 3, 8, 3, 2, 3, 7, 4, 2, 3, 7, 4, 2, 3, 7, 3, 3, 3, 6, 4, 3, 3, 5, 5, 3, 3, 4, 5, 4, 11, 4, 11, 5, 4, 3, 3, 6, 4, 4, 3, 6, 3, 4,
				4, 4, 4, 5, 4, 4, 3, 6, 4, 2, 4, 6, 4, 3, 3, 7, 4, 1, 4, 8, 4,
			]
		),
	},
	{
		c: "Л",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				240, 15, 2, 15, 2, 15, 2, 4, 8, 3, 2, 3, 9, 3, 2, 4, 8, 3, 2, 3, 9, 3, 2, 3, 9, 3, 2, 3, 9, 3, 2, 3, 9, 3, 2, 3, 9, 3, 2, 3, 9, 3, 1,
				4, 9, 3, 1, 4, 9, 3, 1, 4, 9, 3, 1, 3, 10, 7, 10, 3, 16, 1,
			]
		),
	},
	{
		c: "П",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[238, 38, 2, 15, 10, 7, 9, 8, 9, 8, 9, 8, 9, 8, 10, 7, 10, 7, 9, 8, 9, 8, 9, 8, 9, 8, 9, 8, 9, 8, 9, 4]
		),
	},
	{
		c: "У",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				238, 4, 10, 3, 1, 3, 9, 4, 1, 4, 8, 3, 3, 4, 6, 3, 5, 3, 5, 4, 5, 4, 4, 3, 7, 4, 2, 4, 8, 3, 1, 4, 9, 7, 11, 6, 12, 4, 13, 4, 12, 4,
				13, 3, 13, 4, 12, 4, 13, 3,
			]
		),
	},
	{
		c: "Ф",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				274, 3, 12, 11, 6, 15, 3, 17, 2, 4, 3, 3, 3, 4, 2, 3, 4, 3, 4, 3, 2, 3, 4, 3, 4, 3, 1, 4, 4, 3, 5, 7, 4, 3, 5, 7, 4, 3, 5, 7, 4, 3, 5,
				3, 1, 3, 4, 3, 4, 3, 2, 3, 4, 3, 4, 3, 2, 17, 3, 15, 5, 13, 11, 3,
			]
		),
	},
	{
		c: "Ц",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				252, 3, 10, 3, 2, 3, 10, 3, 2, 3, 10, 3, 2, 3, 10, 3, 2, 3, 10, 3, 2, 3, 10, 3, 2, 3, 10, 3, 2, 3, 10, 3, 2, 3, 10, 4, 1, 3, 10, 3, 2,
				3, 10, 3, 2, 4, 9, 3, 2, 3, 10, 3, 2, 3, 10, 3, 2, 4, 9, 4, 1, 36, 14, 4, 14, 4, 14, 4,
			]
		),
	},
	{
		c: "Ч",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[238, 4, 9, 8, 9, 8, 9, 8, 9, 8, 9, 8, 9, 8, 9, 8, 9, 8, 9, 10, 5, 6, 1, 16, 2, 15, 4, 7, 2, 4, 13, 4, 13, 4, 13, 4, 13, 4]
		),
	},
	{
		c: "Ш",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				266, 3, 5, 3, 5, 6, 5, 3, 5, 6, 5, 3, 5, 6, 5, 3, 5, 6, 5, 3, 5, 6, 5, 3, 5, 6, 5, 3, 5, 6, 5, 3, 5, 6, 5, 3, 5, 6, 5, 3, 5, 6, 5, 3,
				5, 6, 5, 3, 5, 6, 5, 3, 5, 6, 5, 3, 5, 6, 5, 3, 5, 41,
			]
		),
	},
	{
		c: "Щ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				294, 3, 5, 3, 5, 4, 1, 3, 5, 3, 5, 4, 1, 3, 5, 3, 5, 4, 1, 3, 5, 3, 5, 4, 1, 3, 5, 3, 5, 4, 1, 3, 5, 3, 5, 4, 1, 3, 5, 3, 5, 4, 1, 3,
				5, 3, 5, 4, 1, 3, 5, 3, 5, 4, 1, 3, 5, 3, 5, 4, 1, 3, 5, 3, 5, 4, 1, 3, 5, 3, 5, 4, 1, 3, 5, 3, 5, 4, 1, 3, 5, 3, 5, 4, 1, 4, 4, 4, 4,
				4, 1, 42, 17, 4, 18, 3, 18, 3,
			]
		),
	},
	{
		c: "Ъ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				280, 8, 12, 8, 12, 8, 17, 3, 17, 3, 17, 3, 17, 10, 10, 14, 6, 15, 5, 3, 8, 4, 5, 3, 9, 3, 5, 3, 9, 3, 5, 3, 9, 3, 5, 3, 9, 3, 5, 3, 8,
				4, 5, 14, 6, 14,
			]
		),
	},
	{
		c: "Ы",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				266, 3, 12, 7, 12, 7, 12, 7, 12, 7, 12, 7, 12, 10, 1, 1, 7, 16, 3, 17, 2, 7, 7, 4, 1, 7, 8, 3, 1, 7, 8, 3, 1, 7, 8, 3, 1, 7, 8, 3, 1,
				7, 7, 4, 1, 17, 2, 16, 3, 4,
			]
		),
	},
	{
		c: "Ь",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[196, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 6, 1, 1, 6, 12, 2, 13, 1, 3, 7, 7, 8, 6, 8, 6, 8, 6, 8, 6, 7, 17, 1, 12]
		),
	},
	{
		c: "Э",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				226, 6, 8, 12, 4, 14, 2, 5, 6, 5, 1, 4, 9, 3, 1, 3, 10, 3, 14, 3, 14, 4, 4, 13, 4, 13, 5, 4, 1, 7, 13, 7, 10, 7, 10, 3, 1, 3, 10, 3,
				1, 5, 7, 4, 1, 16, 2, 14, 6, 9,
			]
		),
	},
	{
		c: "Я",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				227, 13, 2, 14, 1, 5, 5, 1, 1, 3, 1, 3, 9, 3, 1, 3, 9, 3, 1, 3, 9, 3, 1, 3, 9, 3, 1, 4, 8, 3, 2, 14, 3, 13, 2, 4, 7, 3, 1, 4, 8, 3, 1,
				3, 9, 3, 1, 3, 9, 7, 9, 7, 9, 6, 10, 3,
			]
		),
	},
	{
		c: "б",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				203, 6, 5, 9, 4, 7, 6, 4, 10, 10, 3, 12, 2, 5, 4, 4, 1, 3, 7, 3, 1, 3, 7, 6, 8, 6, 8, 6, 8, 3, 1, 2, 8, 6, 8, 3, 1, 3, 7, 3, 1, 12, 3,
				11, 5, 7,
			]
		),
	},
	{ c: "в", data: ImageHelper.fromJsonBinarized(12, 43, [216, 11, 1, 11, 1, 3, 6, 6, 6, 6, 6, 6, 2, 6, 1, 11, 1, 15, 6, 6, 7, 5, 6, 26]) },
	{ skip: true, c: "г", data: ImageHelper.fromJsonBinarized(11, 43, [199, 36, 8, 3, 7, 4, 8, 3, 7, 4, 8, 3, 8, 3, 8, 3, 8, 3, 7, 4]) },
	{
		c: "д",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				273, 11, 4, 11, 4, 3, 5, 3, 4, 3, 5, 3, 4, 3, 5, 3, 4, 3, 5, 3, 4, 3, 5, 3, 4, 3, 5, 3, 4, 2, 6, 3, 3, 3, 6, 3, 3, 3, 6, 3, 1, 33, 9,
				6, 9, 3, 1, 1, 11, 2,
			]
		),
	},
	{
		c: "ж",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				306, 3, 4, 3, 3, 4, 1, 2, 4, 3, 3, 3, 2, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 3, 3, 2, 3, 2, 3, 4, 13, 5, 11, 6, 3, 1, 7, 5, 3, 2, 3, 2,
				3, 4, 3, 2, 3, 2, 3, 3, 3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3, 1, 3, 4, 3, 4, 3, 8, 2, 6, 1,
			]
		),
	},
	{
		c: "з",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[236, 10, 2, 11, 2, 3, 5, 4, 1, 2, 7, 3, 9, 3, 5, 8, 5, 8, 5, 8, 11, 6, 7, 7, 6, 3, 1, 4, 2, 6, 2, 10, 5, 6]
		),
	},
	{
		c: "и",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[234, 3, 5, 8, 5, 8, 4, 9, 4, 9, 3, 3, 1, 6, 3, 3, 1, 6, 2, 3, 2, 6, 1, 3, 3, 6, 1, 3, 3, 9, 4, 8, 5, 8, 5, 7, 6, 3]
		),
	},
	{
		c: "й",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[
				185, 2, 3, 2, 7, 5, 9, 3, 18, 3, 6, 7, 5, 8, 5, 8, 4, 9, 3, 3, 1, 6, 3, 3, 1, 6, 2, 3, 2, 6, 1, 3, 3, 6, 1, 3, 3, 9, 4, 9, 4, 8, 5, 7,
				6, 3,
			]
		),
	},
	{
		c: "к",
		data: ImageHelper.fromJsonBinarized(
			11,
			43,
			[198, 2, 7, 4, 6, 5, 6, 5, 5, 3, 1, 2, 4, 4, 1, 9, 2, 8, 3, 3, 1, 4, 3, 2, 3, 3, 3, 2, 4, 3, 2, 2, 5, 3, 1, 2, 5, 6, 6, 3]
		),
	},
	{
		skip: true,
		c: "л",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[235, 12, 1, 12, 1, 3, 5, 4, 1, 3, 6, 3, 1, 3, 6, 3, 1, 3, 6, 3, 1, 3, 6, 3, 1, 3, 6, 3, 1, 2, 7, 6, 7, 6, 7, 6, 7, 6, 7, 3]
		),
	},
	{
		c: "м",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				252, 3, 8, 7, 6, 8, 5, 10, 4, 10, 4, 7, 1, 2, 4, 7, 1, 2, 3, 8, 1, 3, 2, 2, 2, 4, 2, 2, 1, 3, 2, 4, 2, 6, 2, 4, 3, 4, 3, 4, 3, 4, 3,
				4, 4, 2, 4, 2,
			]
		),
	},
	{ c: "н", data: ImageHelper.fromJsonBinarized(13, 43, [234, 2, 8, 6, 7, 6, 7, 6, 7, 6, 7, 45, 7, 6, 7, 6, 7, 6, 7, 6, 7, 3]) },
	{ skip: true, c: "п", data: ImageHelper.fromJsonBinarized(12, 43, [216, 27, 6, 6, 6, 6, 7, 5, 6, 6, 7, 5, 7, 5, 7, 5, 7, 5, 7, 5, 7, 5, 7, 2]) },
	{
		c: "т",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[243, 3, 3, 2, 1, 31, 1, 9, 6, 4, 10, 4, 10, 4, 10, 4, 10, 4, 10, 4, 10, 4, 10, 4, 10, 4, 10, 4, 10, 3]
		),
	},
	{
		c: "ф",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				303, 3, 18, 3, 18, 3, 18, 3, 10, 18, 3, 19, 1, 4, 4, 5, 4, 7, 5, 4, 6, 6, 6, 3, 6, 6, 6, 3, 6, 6, 6, 3, 6, 6, 6, 3, 6, 6, 6, 3, 6, 6,
				6, 3, 6, 7, 4, 5, 4, 24, 2, 19, 4, 4, 2, 3, 1, 6, 11, 3, 18, 3, 18, 3,
			]
		),
	},
	{
		c: "ц",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				252, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 7, 3, 1, 3, 6, 4, 1, 3, 6, 4, 1, 3, 6, 4, 1, 3, 6, 4,
				1, 28, 10, 4, 10, 4,
			]
		),
	},
	{
		c: "ч",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[234, 3, 6, 3, 1, 3, 6, 3, 1, 3, 6, 7, 6, 7, 6, 3, 1, 3, 6, 3, 1, 3, 6, 3, 1, 12, 2, 12, 2, 11, 9, 3, 10, 4, 9, 3]
		),
	},
	{
		c: "ш",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				270, 3, 4, 2, 4, 5, 4, 2, 4, 5, 4, 2, 4, 5, 4, 2, 4, 5, 4, 2, 4, 5, 4, 2, 4, 5, 4, 2, 4, 5, 4, 2, 4, 5, 4, 2, 4, 5, 4, 2, 4, 5, 4, 2,
				4, 32,
			]
		),
	},
	{
		c: "щ",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				288, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 1, 3,
				3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 1, 3, 3, 3, 3, 3, 1, 32, 13, 3, 14, 2,
			]
		),
	},
	{
		c: "ъ",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[289, 6, 9, 7, 10, 2, 1, 3, 13, 3, 13, 3, 13, 11, 5, 12, 4, 3, 5, 4, 4, 3, 6, 3, 4, 3, 6, 3, 4, 3, 6, 3, 4, 12, 4, 11]
		),
	},
	{
		c: "ы",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[288, 3, 10, 6, 10, 6, 11, 5, 11, 5, 11, 13, 3, 14, 1, 7, 4, 4, 1, 6, 7, 9, 7, 3, 1, 5, 6, 3, 2, 14, 2, 13, 3, 2, 1, 2, 4, 1]
		),
	},
	{ c: "ь", data: ImageHelper.fromJsonBinarized(12, 43, [216, 3, 9, 3, 9, 3, 9, 3, 9, 3, 9, 10, 2, 11, 1, 3, 5, 7, 6, 6, 6, 6, 6, 26]) },
	{
		c: "ю",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				288, 3, 4, 8, 1, 3, 3, 13, 2, 3, 5, 6, 2, 3, 6, 5, 2, 3, 6, 10, 6, 10, 6, 10, 6, 5, 2, 3, 6, 5, 2, 3, 6, 5, 2, 3, 5, 6, 3, 4, 1, 8, 3,
				9, 10, 4,
			]
		),
	},
	{
		c: "я",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[236, 11, 1, 12, 1, 3, 6, 3, 1, 3, 6, 3, 1, 3, 6, 3, 1, 3, 6, 3, 1, 12, 2, 11, 1, 3, 6, 3, 1, 3, 6, 7, 6, 7, 6, 6, 7, 4]
		),
	},
	{
		c: "я",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[225, 1, 4, 3, 3, 11, 1, 12, 1, 4, 4, 4, 1, 3, 6, 3, 1, 3, 6, 3, 1, 4, 1, 7, 1, 12, 1, 12, 1, 5, 3, 4, 1, 3, 6, 7, 6, 7, 5, 8, 5, 7, 7, 3]
		),
	},
	{
		c: "†",
		data: ImageHelper.fromJsonBinarized(
			10,
			43,
			[133, 4, 6, 4, 6, 4, 6, 4, 3, 30, 3, 4, 6, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 7, 3, 8, 2]
		),
	},
	{
		c: "※",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				253, 1, 6, 3, 5, 2, 1, 2, 4, 4, 4, 3, 2, 3, 2, 4, 3, 3, 4, 2, 3, 3, 2, 3, 6, 3, 5, 3, 8, 2, 4, 3, 10, 3, 1, 3, 6, 3, 3, 5, 3, 7, 4, 3,
				3, 8, 3, 4, 3, 4, 1, 2, 3, 3, 1, 3, 2, 2, 6, 3, 3, 2, 9, 3, 5, 3, 6, 3, 3, 1, 3, 3, 4, 3, 2, 4, 3, 3, 2, 3, 3, 4, 4, 2, 2, 2, 5, 3, 5,
				2,
			]
		),
	},
	{
		c: "€",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				240, 7, 8, 13, 4, 15, 3, 5, 6, 5, 2, 3, 9, 4, 1, 4, 10, 15, 3, 16, 5, 13, 6, 3, 14, 12, 6, 12, 3, 15, 3, 3, 1, 4, 10, 3, 1, 4, 9, 4,
				2, 4, 7, 5, 2, 15, 4, 13, 7, 9,
			]
		),
	},
	{
		c: "№",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				280, 3, 3, 2, 12, 3, 3, 2, 12, 3, 3, 2, 12, 4, 2, 2, 12, 4, 2, 2, 3, 6, 3, 4, 2, 2, 2, 8, 2, 4, 2, 2, 2, 2, 3, 3, 2, 5, 1, 3, 1, 2, 4,
				2, 2, 2, 1, 2, 1, 3, 1, 2, 4, 2, 2, 2, 1, 2, 1, 3, 1, 2, 4, 2, 2, 2, 1, 6, 1, 2, 4, 2, 2, 2, 2, 5, 1, 2, 4, 2, 2, 2, 2, 5, 1, 2, 4, 2,
				2, 2, 2, 4, 2, 2, 4, 2, 2, 2, 3, 3, 2, 2, 4, 2, 2, 2, 3, 3, 2, 8, 1, 3, 3, 3, 3, 6, 2, 1, 12, 4,
			]
		),
	},
	{
		c: "™",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				252, 11, 4, 15, 3, 3, 3, 2, 3, 4, 3, 3, 3, 2, 3, 4, 2, 4, 3, 2, 3, 5, 1, 4, 3, 2, 3, 2, 1, 2, 1, 4, 3, 2, 3, 2, 1, 4, 1, 2, 3, 2, 3,
				2, 2, 3, 1, 2, 3, 2, 3, 2, 2, 2, 2, 2,
			]
		),
	},
	{ c: "←", data: ImageHelper.fromJsonBinarized(19, 43, [366, 2, 15, 4, 13, 37, 1, 18, 3, 4, 16, 4, 17, 1]) },
	{
		c: "↑",
		data: ImageHelper.fromJsonBinarized(
			8,
			43,
			[108, 1, 6, 2, 6, 3, 4, 5, 3, 5, 2, 15, 1, 7, 3, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 6, 1]
		),
	},
	{ c: "→", data: ImageHelper.fromJsonBinarized(20, 43, [392, 3, 17, 4, 4, 18, 2, 39, 13, 5, 15, 3, 18, 1]) },
	{
		c: "↓",
		data: ImageHelper.fromJsonBinarized(
			8,
			43,
			[106, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 3, 7, 1, 15, 2, 5, 3, 5, 4, 3, 5, 3, 6, 1]
		),
	},
	{
		c: "⇒",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[295, 2, 17, 3, 16, 4, 5, 15, 4, 16, 3, 17, 16, 4, 16, 4, 15, 22, 1, 17, 2, 16, 14, 4, 14, 4, 15, 3]
		),
	},
	{
		c: "⇔",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				321, 1, 7, 2, 10, 3, 5, 4, 8, 4, 6, 3, 7, 15, 5, 17, 4, 18, 2, 4, 12, 8, 14, 3, 1, 3, 13, 4, 2, 18, 3, 17, 5, 15, 7, 4, 6, 3, 9, 3, 5,
				4, 10, 1, 7, 2,
			]
		),
	},
	{
		c: "∀",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				238, 3, 11, 6, 10, 4, 1, 3, 9, 3, 2, 4, 7, 3, 4, 13, 4, 12, 6, 11, 6, 3, 5, 2, 8, 3, 3, 3, 8, 3, 3, 2, 10, 3, 1, 3, 10, 6, 12, 5, 13,
				3, 14, 3, 15, 1, 16, 1,
			]
		),
	},
	{
		c: "∂",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				201, 6, 6, 9, 4, 11, 3, 3, 5, 3, 4, 1, 7, 3, 11, 3, 5, 9, 3, 11, 2, 12, 1, 4, 6, 3, 1, 3, 7, 3, 1, 3, 6, 3, 1, 4, 6, 3, 2, 3, 5, 3, 3,
				4, 1, 6, 4, 9, 6, 6,
			]
		),
	},
	{
		c: "√",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				286, 7, 14, 8, 12, 5, 1, 2, 13, 3, 17, 3, 18, 3, 18, 2, 18, 3, 18, 3, 11, 2, 4, 3, 12, 3, 3, 3, 11, 4, 2, 3, 11, 5, 2, 3, 11, 6, 1, 3,
				10, 3, 1, 6, 12, 1, 2, 6, 16, 4, 17, 4, 17, 3, 20, 1,
			]
		),
	},
	{
		c: "∞",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[344, 6, 3, 6, 3, 8, 1, 8, 1, 13, 1, 4, 1, 3, 4, 4, 5, 6, 5, 3, 5, 6, 5, 3, 5, 7, 2, 6, 3, 3, 2, 8, 1, 8, 2, 7, 2, 7, 5, 3, 6, 3]
		),
	},
	{
		c: "⊂",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[229, 11, 3, 12, 1, 14, 1, 4, 10, 4, 11, 3, 12, 3, 12, 2, 13, 3, 12, 3, 12, 3, 12, 4, 12, 14, 2, 13, 4, 11]
		),
	},
	{
		c: "⊃",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[241, 9, 6, 13, 3, 14, 12, 5, 12, 4, 13, 3, 14, 3, 13, 3, 13, 3, 13, 3, 12, 3, 12, 4, 2, 13, 2, 13, 4, 10]
		),
	},
	{ c: "■", data: ImageHelper.fromJsonBinarized(20, 43, [260, 380]) },
	{
		c: "□",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[260, 42, 16, 4, 16, 4, 16, 4, 16, 4, 16, 4, 16, 4, 16, 4, 16, 4, 16, 4, 16, 4, 16, 4, 16, 4, 16, 4, 16, 4, 16, 4, 16, 22]
		),
	},
	{
		c: "▲",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[325, 1, 20, 2, 18, 3, 17, 5, 15, 7, 14, 8, 12, 9, 11, 11, 9, 13, 8, 13, 7, 15, 5, 17, 4, 18, 2, 19, 1, 21]
		),
	},
	{
		c: "△",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				325, 1, 19, 3, 18, 3, 17, 2, 1, 2, 15, 2, 3, 2, 14, 2, 3, 2, 13, 2, 5, 2, 11, 2, 7, 2, 9, 2, 9, 2, 8, 2, 9, 2, 7, 2, 11, 2, 5, 2, 13,
				2, 3, 2, 15, 2, 2, 19, 1, 21,
			]
		),
	},
	{
		c: "▼",
		data: ImageHelper.fromJsonBinarized(20, 43, [300, 59, 2, 17, 4, 16, 5, 14, 6, 13, 8, 11, 10, 10, 11, 8, 12, 7, 14, 5, 16, 4, 17, 2, 18, 1]),
	},
	{
		c: "▽",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				315, 19, 1, 1, 1, 20, 1, 3, 14, 2, 3, 2, 13, 2, 5, 2, 11, 2, 7, 2, 10, 2, 7, 2, 9, 2, 9, 2, 7, 2, 11, 2, 6, 2, 12, 2, 4, 2, 13, 2, 3,
				2, 15, 2, 1, 2, 17, 4, 18, 2, 19, 1,
			]
		),
	},
	{
		c: "◆",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				262, 1, 19, 3, 17, 5, 15, 7, 13, 9, 11, 11, 9, 13, 7, 15, 5, 17, 3, 19, 1, 21, 1, 19, 3, 17, 5, 15, 7, 13, 9, 11, 11, 9, 13, 7, 15, 5,
				17, 3, 19, 1,
			]
		),
	},
	{
		c: "◇",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				262, 1, 19, 3, 17, 5, 15, 2, 3, 2, 13, 2, 5, 2, 11, 2, 7, 2, 9, 2, 9, 2, 7, 2, 11, 2, 5, 2, 13, 2, 3, 2, 15, 2, 1, 2, 17, 2, 1, 2, 15,
				3, 2, 2, 13, 3, 4, 2, 11, 3, 6, 2, 9, 3, 8, 2, 7, 3, 10, 2, 5, 2, 13, 2, 3, 2, 15, 2, 1, 3, 16, 4, 18, 1,
			]
		),
	},
	{
		c: "○",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				266, 7, 11, 5, 1, 5, 8, 3, 8, 2, 6, 2, 11, 2, 4, 2, 13, 2, 3, 2, 14, 1, 2, 2, 15, 2, 1, 2, 16, 1, 1, 1, 17, 1, 1, 1, 17, 3, 17, 1, 1,
				1, 17, 1, 1, 2, 15, 2, 1, 2, 15, 2, 2, 2, 13, 2, 4, 2, 11, 2, 5, 3, 9, 3, 7, 3, 6, 3, 9, 9, 14, 1, 1, 1,
			]
		),
	},
	{
		c: "◎",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				266, 8, 10, 5, 1, 5, 8, 3, 8, 3, 5, 2, 3, 5, 3, 3, 3, 2, 3, 8, 2, 2, 3, 2, 2, 2, 6, 2, 2, 2, 1, 2, 2, 2, 8, 2, 2, 1, 1, 2, 1, 2, 9, 2,
				2, 1, 1, 2, 1, 2, 10, 1, 2, 4, 1, 2, 10, 1, 2, 4, 1, 2, 10, 1, 2, 4, 1, 2, 10, 1, 2, 4, 2, 1, 9, 2, 2, 1, 2, 1, 2, 2, 7, 2, 2, 2, 2,
				2, 2, 3, 4, 2, 3, 1, 4, 2, 2, 7, 3, 2, 5, 2, 10, 2, 7, 3, 6, 3, 9, 9, 15, 2,
			]
		),
	},
	{
		c: "●",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[266, 7, 11, 11, 8, 13, 6, 15, 4, 17, 3, 18, 1, 19, 1, 19, 1, 19, 1, 59, 1, 19, 2, 18, 2, 17, 4, 16, 5, 14, 7, 12, 9, 9, 16, 1]
		),
	},
	{
		c: "★",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				269, 2, 18, 2, 18, 2, 17, 4, 16, 4, 16, 4, 15, 6, 7, 20, 1, 18, 4, 14, 7, 12, 9, 10, 10, 10, 10, 10, 10, 10, 9, 5, 2, 4, 9, 4, 4, 4,
				8, 2, 8, 2, 8, 1, 10, 1,
			]
		),
	},
	{
		c: "☆",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				262, 1, 20, 1, 20, 1, 19, 3, 18, 3, 18, 1, 1, 1, 17, 2, 1, 2, 16, 2, 1, 2, 8, 9, 3, 9, 2, 3, 11, 3, 5, 3, 9, 3, 8, 2, 7, 2, 11, 2, 5,
				2, 12, 1, 6, 2, 12, 1, 3, 1, 3, 1, 11, 2, 1, 5, 1, 2, 10, 5, 1, 5, 10, 3, 5, 3, 9, 3, 7, 3, 8, 2, 9, 2,
			]
		),
	},
	{
		c: "♀",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				200, 5, 9, 7, 7, 9, 6, 3, 3, 3, 6, 3, 4, 2, 6, 3, 3, 3, 6, 3, 3, 3, 7, 8, 8, 6, 10, 3, 12, 3, 6, 30, 1, 14, 6, 3, 12, 3, 12, 3, 12, 3,
				12, 3, 14, 1,
			]
		),
	},
	{
		c: "♂",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				262, 10, 7, 10, 12, 5, 12, 5, 10, 7, 10, 3, 1, 3, 8, 4, 2, 3, 3, 8, 3, 3, 1, 9, 4, 3, 1, 4, 1, 4, 4, 6, 4, 3, 6, 4, 4, 3, 7, 4, 3, 3,
				8, 4, 1, 4, 8, 8, 11, 5,
			]
		),
	},
	{
		c: "♪",
		data: ImageHelper.fromJsonBinarized(
			13,
			43,
			[
				161, 1, 12, 1, 12, 2, 11, 3, 10, 4, 9, 5, 8, 6, 7, 7, 6, 2, 2, 4, 5, 2, 2, 4, 5, 2, 3, 3, 5, 2, 3, 3, 5, 2, 3, 2, 6, 2, 2, 3, 6, 2, 2,
				2, 4, 5, 1, 2, 4, 5, 2, 1, 4, 6, 7, 6, 8, 4,
			]
		),
	},
	{
		c: "♭",
		data: ImageHelper.fromJsonBinarized(
			10,
			43,
			[
				130, 2, 8, 2, 8, 2, 8, 2, 8, 2, 8, 2, 8, 2, 8, 2, 3, 3, 2, 2, 1, 6, 1, 14, 3, 5, 5, 5, 5, 5, 5, 5, 4, 3, 1, 2, 3, 4, 1, 2, 3, 3, 2, 7,
				3, 6,
			]
		),
	},
	{ c: "、", data: ImageHelper.fromJsonBinarized(7, 43, [183, 2, 4, 5, 2, 5, 4, 4, 4, 4, 3, 4, 4, 2]) },
	{ c: "。", data: ImageHelper.fromJsonBinarized(7, 43, [183, 5, 1, 3, 1, 5, 3, 4, 3, 4, 3, 2, 1, 5, 3, 3]) },
	{
		c: "〃",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[
				229, 2, 12, 3, 3, 2, 6, 3, 3, 3, 4, 3, 3, 3, 5, 3, 3, 3, 4, 3, 3, 4, 4, 3, 3, 3, 4, 3, 3, 3, 4, 4, 3, 3, 3, 4, 3, 3, 4, 3, 3, 4, 5, 1,
				4, 3, 11, 2,
			]
		),
	},
	{
		c: "々",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				259, 4, 14, 3, 14, 4, 14, 12, 5, 13, 4, 5, 5, 4, 4, 4, 6, 4, 3, 4, 7, 3, 3, 4, 7, 4, 2, 4, 7, 4, 2, 4, 3, 1, 4, 3, 4, 2, 3, 4, 1, 4,
				9, 8, 12, 5, 14, 6, 13, 5, 14, 3, 16, 2,
			]
		),
	},
	{
		c: "〆",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				245, 6, 12, 7, 13, 5, 13, 4, 13, 4, 7, 2, 4, 4, 6, 6, 1, 4, 7, 10, 7, 3, 2, 5, 8, 3, 2, 6, 7, 3, 2, 7, 6, 3, 1, 4, 1, 3, 6, 2, 1, 4,
				3, 1, 6, 3, 1, 3, 11, 6, 12, 5, 13, 5, 12, 5, 13, 4,
			]
		),
	},
	{
		c: "「",
		data: ImageHelper.fromJsonBinarized(
			8,
			43,
			[96, 27, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3, 5, 3]
		),
	},
	{
		c: "」",
		data: ImageHelper.fromJsonBinarized(
			7,
			43,
			[95, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 3, 4, 24]
		),
	},
	{
		c: "【",
		data: ImageHelper.fromJsonBinarized(
			6,
			43,
			[72, 23, 1, 5, 1, 4, 2, 4, 2, 4, 2, 4, 2, 4, 2, 3, 3, 3, 3, 4, 2, 4, 2, 4, 2, 4, 2, 4, 2, 5, 1, 5, 1, 12]
		),
	},
	{
		c: "】",
		data: ImageHelper.fromJsonBinarized(
			8,
			43,
			[96, 7, 2, 6, 2, 6, 3, 6, 2, 6, 2, 6, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 3, 5, 3, 5, 3, 5, 2, 6, 2, 6]
		),
	},
	{ c: "〒", data: ImageHelper.fromJsonBinarized(17, 43, [238, 34, 68, 34, 7, 3, 14, 3, 14, 3, 14, 3, 14, 3, 14, 3, 14, 3, 14, 3, 14, 3]) },
	{
		c: "ぁ",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				277, 3, 9, 14, 2, 14, 2, 2, 1, 11, 6, 2, 3, 3, 8, 8, 7, 11, 4, 5, 1, 7, 2, 5, 1, 3, 2, 3, 1, 3, 1, 6, 2, 3, 1, 2, 2, 5, 3, 6, 2, 4, 4,
				6, 2, 4, 3, 4, 1, 8, 1, 5, 2, 5, 2, 6, 11, 3,
			]
		),
	},
	{
		c: "あ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				253, 3, 16, 3, 12, 15, 3, 17, 6, 4, 16, 3, 4, 2, 10, 3, 1, 5, 9, 11, 7, 13, 5, 5, 2, 8, 3, 6, 2, 3, 3, 3, 1, 3, 1, 3, 1, 3, 4, 3, 1,
				2, 3, 6, 5, 2, 1, 2, 3, 5, 5, 6, 3, 4, 6, 6, 3, 4, 6, 2, 2, 9, 4, 4, 2, 8, 2, 6, 4, 3, 5, 6, 14, 2,
			]
		),
	},
	{
		c: "ぃ",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				307, 3, 7, 1, 5, 4, 6, 3, 4, 3, 8, 3, 3, 3, 8, 3, 3, 3, 9, 3, 2, 3, 9, 3, 3, 3, 8, 4, 2, 3, 9, 3, 2, 3, 3, 1, 5, 3, 2, 3, 2, 2, 5, 3,
				2, 4, 1, 3, 5, 3, 1, 8, 5, 3, 2, 6, 12, 4,
			]
		),
	},
	{
		c: "い",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				285, 3, 9, 3, 4, 3, 9, 4, 3, 3, 10, 4, 2, 3, 10, 4, 2, 3, 11, 3, 2, 3, 11, 4, 1, 3, 12, 3, 1, 3, 12, 3, 1, 3, 12, 7, 5, 1, 7, 7, 4, 1,
				7, 3, 1, 3, 3, 3, 6, 3, 1, 3, 3, 3, 6, 3, 1, 9, 6, 3, 2, 7, 7, 1, 4, 6, 15, 3,
			]
		),
	},
	{
		c: "う",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[224, 10, 7, 12, 4, 13, 14, 3, 26, 6, 5, 14, 2, 16, 1, 7, 5, 8, 10, 4, 14, 3, 14, 3, 14, 3, 13, 4, 12, 4, 11, 6, 3, 13, 4, 11, 7, 8]
		),
	},
	{
		c: "ぇ",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[276, 8, 7, 10, 12, 3, 21, 12, 4, 12, 11, 4, 11, 4, 11, 4, 11, 4, 10, 7, 8, 4, 2, 2, 7, 4, 3, 3, 5, 4, 4, 8, 1, 2, 6, 7]
		),
	},
	{
		c: "え",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				264, 11, 9, 12, 8, 12, 45, 15, 5, 15, 6, 14, 14, 4, 15, 4, 15, 4, 14, 5, 14, 7, 12, 8, 11, 4, 3, 3, 9, 4, 4, 3, 7, 5, 5, 14, 7, 9, 1,
				2, 8, 8,
			]
		),
	},
	{
		c: "ぉ",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				276, 3, 13, 3, 3, 3, 3, 9, 1, 5, 1, 9, 2, 5, 1, 7, 5, 3, 4, 3, 13, 8, 7, 11, 4, 6, 2, 5, 1, 7, 5, 3, 1, 3, 1, 3, 6, 2, 1, 2, 2, 3, 5,
				3, 1, 2, 2, 3, 5, 3, 1, 6, 1, 8, 2, 5, 2, 6, 5, 1, 4, 3,
			]
		),
	},
	{
		c: "お",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				266, 3, 17, 3, 5, 1, 11, 3, 4, 5, 3, 11, 1, 6, 2, 11, 3, 5, 1, 11, 5, 3, 6, 3, 9, 2, 6, 3, 17, 10, 9, 13, 5, 7, 3, 6, 3, 7, 7, 3, 2,
				4, 1, 3, 7, 8, 2, 3, 7, 7, 3, 3, 7, 7, 3, 3, 7, 3, 1, 4, 1, 4, 1, 1, 2, 6, 2, 7, 2, 8, 4, 6, 2, 7, 7, 1, 8, 1,
			]
		),
	},
	{
		c: "か",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				265, 4, 16, 4, 16, 3, 6, 2, 9, 3, 5, 4, 3, 12, 2, 4, 2, 13, 2, 3, 2, 14, 1, 4, 5, 3, 4, 3, 2, 3, 5, 3, 4, 3, 2, 3, 4, 3, 5, 3, 3, 3,
				3, 3, 5, 3, 3, 3, 2, 4, 5, 3, 3, 3, 2, 3, 6, 3, 3, 1, 4, 3, 6, 3, 7, 4, 5, 3, 8, 3, 6, 3, 7, 4, 1, 8, 7, 3, 2, 7, 8, 3, 3, 5,
			]
		),
	},
	{
		c: "が",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				257, 2, 6, 4, 5, 2, 1, 3, 5, 3, 7, 2, 1, 2, 5, 3, 7, 3, 7, 3, 6, 3, 3, 12, 2, 4, 2, 13, 2, 3, 2, 14, 1, 4, 5, 3, 4, 3, 2, 3, 5, 3, 4,
				3, 2, 3, 4, 4, 4, 3, 3, 3, 3, 3, 5, 3, 3, 3, 2, 4, 5, 3, 3, 3, 2, 3, 6, 3, 3, 1, 4, 3, 6, 3, 7, 4, 5, 3, 8, 3, 6, 3, 7, 4, 1, 8, 7, 3,
				2, 7, 8, 3, 3, 5,
			]
		),
	},
	{
		c: "き",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				240, 4, 15, 3, 3, 3, 3, 16, 2, 16, 2, 11, 15, 3, 4, 2, 1, 1, 2, 1, 1, 30, 1, 14, 15, 3, 16, 3, 6, 13, 3, 15, 2, 4, 9, 2, 3, 3, 15, 3,
				15, 5, 6, 4, 4, 14, 6, 12, 10, 1,
			]
		),
	},
	{
		c: "き",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				223, 1, 16, 3, 15, 3, 3, 4, 2, 16, 2, 16, 2, 11, 15, 4, 3, 2, 7, 44, 15, 3, 16, 3, 6, 13, 3, 16, 1, 5, 8, 3, 2, 3, 15, 4, 14, 6, 5, 4,
				4, 14, 6, 12, 10, 3,
			]
		),
	},
	{
		c: "ぎ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				248, 1, 5, 2, 1, 2, 7, 3, 5, 2, 1, 2, 7, 4, 2, 5, 1, 19, 3, 16, 4, 12, 17, 3, 3, 3, 6, 14, 2, 18, 2, 14, 17, 4, 17, 4, 7, 14, 4, 16,
				4, 4, 8, 3, 4, 4, 17, 3, 17, 6, 4, 4, 7, 13, 8, 12, 13, 3,
			]
		),
	},
	{
		c: "ぎ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				254, 2, 1, 2, 7, 3, 6, 2, 1, 2, 7, 3, 3, 4, 1, 2, 1, 16, 4, 15, 5, 11, 17, 3, 3, 3, 2, 1, 3, 1, 1, 12, 2, 18, 2, 15, 17, 3, 17, 4, 7,
				14, 5, 15, 4, 4, 8, 3, 5, 3, 17, 3, 17, 6, 5, 4, 6, 13, 9, 11,
			]
		),
	},
	{
		c: "く",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[219, 3, 12, 5, 9, 7, 8, 6, 8, 6, 9, 6, 8, 6, 9, 5, 10, 5, 11, 4, 13, 4, 12, 6, 12, 5, 12, 6, 12, 6, 11, 6, 11, 7, 11, 6, 11, 4, 13, 2]
		),
	},
	{
		c: "ぐ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				258, 3, 15, 5, 12, 7, 11, 6, 2, 2, 7, 6, 3, 1, 1, 2, 5, 6, 3, 3, 1, 2, 2, 6, 6, 3, 3, 5, 9, 1, 3, 5, 14, 4, 16, 4, 16, 5, 15, 5, 15,
				6, 15, 6, 14, 6, 15, 6, 14, 6, 14, 4, 17, 1,
			]
		),
	},
	{
		c: "ぐ",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				245, 3, 14, 5, 11, 6, 11, 6, 2, 2, 6, 6, 4, 3, 3, 6, 4, 2, 1, 2, 2, 5, 7, 2, 3, 5, 9, 1, 2, 4, 14, 4, 14, 5, 14, 5, 14, 6, 14, 6, 13,
				6, 14, 6, 13, 6, 14, 5, 14, 3, 16, 1,
			]
		),
	},
	{
		c: "け",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				260, 1, 5, 3, 9, 3, 4, 4, 8, 3, 4, 4, 8, 3, 4, 3, 2, 17, 2, 17, 2, 17, 9, 4, 3, 3, 9, 3, 4, 3, 9, 3, 4, 3, 9, 3, 4, 3, 9, 3, 4, 3, 9,
				3, 4, 3, 8, 4, 4, 3, 8, 3, 5, 3, 7, 4, 5, 3, 5, 5, 6, 3, 3, 6, 7, 3, 3, 5, 15, 1,
			]
		),
	},
	{
		c: "げ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				256, 1, 1, 1, 2, 3, 8, 3, 1, 1, 1, 2, 1, 3, 8, 3, 1, 8, 8, 3, 5, 4, 8, 3, 5, 3, 2, 14, 1, 3, 2, 14, 1, 3, 2, 14, 1, 3, 9, 3, 5, 3, 9,
				3, 5, 3, 9, 3, 5, 3, 9, 3, 5, 3, 9, 3, 5, 3, 9, 3, 5, 3, 9, 3, 5, 3, 8, 4, 5, 3, 7, 4, 6, 3, 5, 6, 6, 3, 3, 7, 7, 3, 3, 5, 16, 2,
			]
		),
	},
	{
		c: "こ",
		data: ImageHelper.fromJsonBinarized(17, 43, [244, 5, 7, 15, 2, 14, 3, 14, 105, 2, 14, 4, 13, 3, 14, 4, 13, 6, 7, 4, 1, 16, 2, 15, 4, 12]),
	},
	{
		c: "ご",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[241, 2, 1, 2, 14, 6, 6, 5, 3, 2, 1, 2, 1, 15, 4, 14, 5, 14, 119, 2, 16, 4, 15, 3, 16, 3, 16, 6, 7, 4, 3, 16, 4, 15, 6, 12]
		),
	},
	{
		c: "ご",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[254, 1, 1, 2, 16, 2, 1, 2, 8, 4, 3, 3, 1, 2, 1, 15, 5, 14, 6, 14, 126, 2, 18, 3, 16, 3, 17, 4, 17, 4, 10, 2, 4, 16, 5, 15, 8, 10]
		),
	},
	{
		c: "さ",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[241, 3, 15, 4, 15, 3, 3, 4, 1, 49, 14, 4, 15, 4, 15, 3, 9, 10, 5, 14, 3, 16, 1, 4, 8, 4, 2, 3, 15, 3, 15, 4, 10, 1, 4, 14, 5, 13, 7, 11]
		),
	},
	{
		c: "ざ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				255, 1, 1, 2, 8, 3, 4, 2, 1, 2, 9, 3, 4, 2, 1, 2, 8, 3, 3, 4, 4, 1, 1, 14, 2, 18, 3, 14, 16, 3, 17, 4, 17, 4, 10, 11, 6, 14, 5, 16, 3,
				4, 9, 3, 4, 3, 17, 3, 17, 5, 16, 14, 7, 13, 9, 11,
			]
		),
	},
	{
		c: "し",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				238, 4, 13, 4, 13, 3, 14, 3, 14, 3, 14, 3, 14, 3, 14, 3, 14, 3, 14, 3, 14, 3, 11, 6, 10, 7, 10, 3, 1, 3, 9, 3, 3, 3, 6, 5, 3, 4, 2, 7,
				5, 10, 8, 8,
			]
		),
	},
	{
		c: "し",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				221, 4, 13, 4, 13, 4, 13, 4, 13, 4, 13, 3, 14, 4, 13, 3, 14, 3, 14, 3, 14, 3, 11, 2, 1, 3, 11, 6, 10, 7, 9, 4, 1, 4, 7, 5, 1, 4, 6, 5,
				3, 5, 1, 7, 4, 12, 6, 9, 12, 1,
			]
		),
	},
	{
		c: "じ",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				221, 4, 13, 4, 6, 1, 6, 4, 6, 2, 5, 4, 3, 2, 2, 2, 4, 4, 3, 3, 2, 2, 3, 4, 4, 3, 6, 3, 6, 2, 6, 3, 14, 3, 14, 3, 14, 3, 11, 2, 1, 3,
				11, 6, 10, 7, 9, 4, 1, 4, 7, 5, 1, 4, 6, 5, 3, 13, 4, 12, 6, 9, 12, 1,
			]
		),
	},
	{
		c: "じ",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				222, 2, 15, 3, 14, 3, 6, 3, 4, 4, 4, 2, 1, 2, 4, 4, 4, 3, 1, 1, 4, 4, 5, 2, 7, 3, 13, 4, 14, 3, 13, 3, 14, 3, 12, 1, 1, 3, 11, 6, 10,
				8, 9, 4, 1, 3, 8, 4, 2, 3, 6, 5, 3, 13, 5, 11, 7, 7,
			]
		),
	},
	{
		c: "す",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				271, 2, 17, 3, 8, 18, 1, 40, 10, 3, 14, 6, 12, 8, 11, 9, 11, 3, 3, 3, 11, 3, 3, 4, 10, 3, 2, 5, 10, 10, 11, 9, 13, 6, 15, 5, 14, 5,
				12, 7, 13, 6, 15, 2,
			]
		),
	},
	{
		c: "ず",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				255, 2, 1, 2, 10, 3, 2, 2, 1, 2, 10, 3, 3, 1, 2, 20, 1, 40, 10, 3, 14, 6, 12, 8, 11, 9, 11, 3, 3, 3, 11, 2, 4, 4, 10, 3, 2, 5, 10, 10,
				11, 8, 17, 3, 16, 4, 14, 5, 11, 8, 13, 5, 16, 2,
			]
		),
	},
	{
		c: "せ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				277, 3, 6, 4, 8, 3, 6, 4, 8, 3, 6, 4, 8, 3, 6, 4, 8, 3, 6, 4, 4, 63, 4, 3, 6, 3, 9, 3, 6, 3, 9, 3, 6, 3, 9, 3, 2, 7, 9, 3, 3, 6, 9, 3,
				3, 5, 10, 3, 18, 4, 17, 14, 8, 13, 9, 12,
			]
		),
	},
	{
		c: "ぜ",
		data: ImageHelper.fromJsonBinarized(
			22,
			43,
			[
				281, 4, 5, 3, 7, 5, 1, 1, 5, 3, 7, 5, 1, 2, 4, 3, 7, 3, 1, 1, 7, 3, 7, 3, 9, 3, 7, 3, 5, 21, 1, 21, 1, 21, 5, 3, 7, 3, 9, 3, 7, 3, 9,
				3, 6, 4, 9, 3, 3, 7, 9, 3, 3, 6, 10, 3, 4, 4, 11, 3, 19, 4, 19, 13, 9, 13, 11, 11,
			]
		),
	},
	{
		c: "そ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				280, 3, 1, 6, 7, 14, 7, 14, 8, 5, 1, 6, 15, 4, 15, 5, 14, 5, 14, 58, 1, 4, 4, 5, 15, 4, 16, 3, 17, 4, 17, 4, 17, 4, 18, 6, 4, 1, 11,
				10, 12, 9, 15, 6,
			]
		),
	},
	{
		c: "ぞ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				271, 5, 7, 13, 7, 13, 2, 1, 4, 4, 3, 6, 2, 2, 9, 5, 1, 2, 2, 1, 7, 5, 4, 2, 7, 5, 7, 1, 5, 6, 3, 52, 3, 5, 14, 4, 15, 4, 16, 3, 17, 3,
				17, 3, 17, 6, 15, 10, 12, 8, 16, 3,
			]
		),
	},
	{
		c: "た",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				252, 3, 16, 3, 12, 12, 6, 13, 6, 13, 10, 3, 16, 3, 7, 1, 7, 4, 3, 9, 3, 3, 4, 9, 3, 3, 16, 3, 15, 3, 16, 3, 16, 3, 15, 3, 4, 2, 10, 3,
				4, 3, 9, 3, 4, 6, 1, 3, 1, 4, 5, 13, 7, 9,
			]
		),
	},
	{
		c: "だ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				265, 4, 8, 2, 6, 3, 7, 2, 1, 16, 2, 3, 1, 14, 2, 2, 2, 14, 10, 4, 16, 4, 4, 7, 5, 3, 3, 10, 4, 3, 3, 10, 3, 4, 11, 1, 4, 3, 17, 3, 16,
				4, 16, 3, 17, 3, 3, 3, 10, 4, 3, 3, 10, 3, 4, 6, 2, 3, 1, 4, 5, 15, 6, 10,
			]
		),
	},
	{
		c: "ち",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				254, 3, 15, 4, 10, 16, 2, 17, 2, 17, 7, 3, 16, 3, 15, 3, 16, 3, 2, 5, 8, 14, 4, 16, 3, 6, 6, 4, 3, 4, 9, 4, 15, 4, 15, 3, 15, 4, 4,
				14, 5, 13, 6, 12,
			]
		),
	},
	{
		c: "ち",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				241, 3, 14, 4, 9, 16, 1, 17, 1, 17, 6, 3, 15, 3, 14, 3, 15, 3, 2, 5, 7, 14, 3, 16, 2, 6, 6, 4, 2, 4, 9, 3, 15, 3, 15, 3, 14, 4, 3, 14,
				4, 13, 5, 11,
			]
		),
	},
	{
		c: "ぢ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				245, 1, 7, 3, 5, 2, 1, 2, 6, 3, 5, 3, 1, 1, 5, 4, 5, 3, 2, 17, 2, 17, 6, 3, 16, 3, 15, 3, 16, 3, 4, 3, 8, 14, 5, 15, 3, 6, 7, 3, 3, 4,
				9, 4, 15, 4, 15, 4, 14, 4, 4, 4, 4, 7, 4, 13, 6, 12,
			]
		),
	},
	{
		c: "っ",
		data: ImageHelper.fromJsonBinarized(16, 43, [310, 6, 4, 15, 1, 21, 7, 4, 13, 3, 13, 3, 13, 3, 13, 3, 12, 4, 10, 5, 4, 11, 5, 10, 7, 6]),
	},
	{
		c: "つ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[340, 14, 3, 19, 3, 19, 2, 5, 10, 4, 18, 4, 17, 4, 17, 4, 17, 4, 17, 4, 16, 4, 16, 5, 14, 6, 7, 13, 8, 11, 10, 9, 13, 3]
		),
	},
	{
		c: "て",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[286, 37, 1, 6, 1, 7, 13, 4, 14, 3, 15, 3, 16, 2, 16, 3, 16, 3, 16, 2, 16, 3, 17, 3, 16, 4, 16, 4, 16, 9, 11, 9, 12, 6]
		),
	},
	{
		c: "で",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				295, 3, 2, 19, 1, 19, 2, 4, 3, 6, 14, 4, 15, 4, 6, 3, 6, 3, 6, 2, 2, 1, 6, 3, 7, 2, 7, 3, 17, 3, 17, 3, 17, 3, 17, 3, 18, 3, 17, 4,
				17, 10, 11, 9, 14, 5,
			]
		),
	},
	{
		c: "と",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				226, 3, 14, 3, 14, 3, 14, 3, 14, 4, 13, 4, 4, 3, 7, 10, 6, 11, 4, 12, 4, 7, 9, 5, 11, 4, 13, 4, 13, 3, 14, 4, 13, 5, 10, 2, 1, 16, 2,
				15, 4, 13,
			]
		),
	},
	{
		c: "ど",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				252, 3, 8, 2, 6, 3, 6, 1, 1, 3, 5, 3, 6, 2, 1, 1, 6, 3, 7, 2, 7, 3, 17, 2, 6, 1, 10, 10, 8, 11, 7, 11, 6, 6, 13, 3, 15, 3, 16, 2, 16,
				3, 17, 2, 17, 3, 16, 15, 5, 14, 8, 10,
			]
		),
	},
	{
		c: "な",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				253, 2, 16, 3, 13, 8, 9, 11, 2, 5, 1, 11, 2, 6, 4, 3, 6, 5, 5, 3, 15, 3, 6, 2, 8, 3, 6, 2, 7, 3, 7, 2, 7, 3, 7, 2, 6, 3, 7, 3, 5, 3,
				4, 7, 5, 3, 3, 9, 4, 2, 3, 3, 3, 6, 2, 1, 4, 2, 4, 7, 6, 2, 4, 3, 1, 3, 6, 9, 3, 1, 7, 7,
			]
		),
	},
	{
		c: "に",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				235, 2, 16, 3, 15, 3, 2, 11, 1, 4, 2, 11, 1, 3, 3, 11, 1, 3, 15, 3, 15, 3, 15, 3, 15, 3, 15, 3, 15, 3, 15, 3, 3, 2, 10, 3, 2, 3, 10,
				3, 2, 4, 9, 3, 3, 15, 3, 15, 5, 13,
			]
		),
	},
	{
		c: "ぬ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				284, 4, 9, 3, 5, 3, 10, 3, 5, 3, 10, 3, 2, 7, 9, 14, 7, 15, 6, 5, 2, 3, 2, 4, 5, 3, 3, 3, 4, 3, 4, 5, 2, 3, 4, 4, 2, 6, 1, 3, 6, 3, 2,
				2, 1, 3, 1, 3, 6, 3, 1, 3, 2, 5, 7, 3, 1, 3, 2, 5, 7, 3, 1, 3, 2, 4, 2, 9, 1, 3, 2, 4, 1, 9, 2, 9, 1, 2, 3, 5, 2, 7, 2, 2, 3, 6, 1, 5,
				4, 10, 12, 5, 3, 1,
			]
		),
	},
	{
		c: "ね",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				278, 3, 18, 3, 18, 3, 18, 3, 4, 6, 8, 3, 3, 8, 3, 7, 1, 5, 1, 4, 3, 11, 4, 3, 4, 9, 5, 4, 5, 6, 7, 3, 5, 5, 8, 3, 4, 5, 9, 3, 4, 5, 9,
				3, 3, 6, 4, 2, 3, 3, 2, 7, 2, 10, 2, 3, 1, 3, 1, 10, 2, 3, 2, 3, 1, 3, 3, 5, 2, 2, 2, 3, 1, 3, 3, 6, 1, 1, 3, 3, 2, 11, 5, 3, 3, 6, 2,
				1, 6, 3,
			]
		),
	},
	{
		c: "の",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				286, 9, 9, 12, 7, 15, 4, 4, 2, 3, 3, 4, 3, 4, 3, 3, 4, 4, 2, 3, 4, 3, 5, 3, 1, 3, 5, 3, 5, 7, 4, 4, 6, 6, 4, 3, 7, 5, 5, 3, 7, 5, 4,
				4, 7, 5, 4, 4, 6, 7, 3, 3, 7, 3, 1, 3, 2, 4, 6, 4, 1, 8, 6, 4, 3, 7, 4, 6, 4, 5, 2, 8, 12, 6, 15, 2,
			]
		),
	},
	{
		c: "は",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				248, 3, 8, 3, 5, 3, 8, 3, 5, 3, 8, 3, 5, 3, 8, 3, 5, 3, 1, 17, 2, 17, 2, 17, 9, 3, 4, 3, 9, 3, 4, 3, 9, 3, 4, 3, 9, 3, 4, 3, 9, 3, 4,
				3, 4, 8, 4, 3, 3, 11, 2, 3, 2, 3, 4, 6, 1, 3, 2, 3, 4, 10, 2, 5, 1, 11, 3, 8, 3, 5, 4, 6,
			]
		),
	},
	{
		c: "は",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				248, 2, 9, 3, 4, 4, 8, 3, 4, 4, 8, 3, 4, 3, 9, 3, 4, 3, 2, 17, 2, 17, 2, 17, 9, 3, 4, 3, 9, 3, 4, 3, 9, 3, 4, 3, 9, 3, 4, 3, 5, 3, 1,
				3, 4, 3, 3, 9, 4, 3, 2, 11, 3, 3, 2, 3, 4, 6, 1, 3, 2, 3, 4, 10, 2, 4, 1, 12, 2, 9, 2, 2, 1, 3, 4, 6, 4, 1,
			]
		),
	},
	{
		c: "ば",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				255, 2, 1, 1, 2, 3, 8, 3, 1, 1, 1, 2, 1, 3, 8, 3, 1, 2, 1, 1, 1, 3, 8, 3, 1, 1, 3, 4, 8, 3, 5, 3, 2, 14, 1, 3, 2, 14, 1, 3, 2, 14, 1,
				3, 9, 3, 5, 3, 9, 3, 5, 3, 9, 3, 5, 3, 9, 3, 5, 3, 6, 2, 1, 3, 5, 3, 4, 8, 5, 3, 3, 10, 4, 3, 2, 3, 4, 6, 2, 3, 2, 3, 4, 7, 1, 3, 2,
				4, 1, 9, 1, 3, 3, 8, 3, 2, 1, 3, 4, 6, 4, 1,
			]
		),
	},
	{
		c: "ぱ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				256, 3, 2, 3, 8, 3, 1, 1, 1, 2, 1, 3, 8, 3, 1, 1, 1, 2, 1, 3, 8, 3, 1, 3, 2, 3, 8, 3, 6, 3, 1, 14, 1, 3, 2, 14, 1, 3, 2, 14, 1, 3, 9,
				3, 5, 3, 9, 3, 5, 3, 9, 3, 5, 3, 9, 3, 5, 3, 7, 1, 1, 3, 5, 3, 4, 8, 5, 3, 3, 11, 3, 3, 2, 3, 4, 6, 2, 3, 2, 3, 4, 7, 1, 3, 2, 5, 1,
				8, 1, 3, 3, 8, 3, 2, 1, 3, 4, 6,
			]
		),
	},
	{
		c: "ひ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				280, 10, 2, 4, 4, 10, 2, 4, 5, 8, 4, 3, 8, 3, 6, 4, 6, 3, 7, 4, 5, 3, 8, 5, 4, 3, 9, 4, 3, 3, 10, 5, 2, 3, 9, 7, 1, 3, 9, 3, 1, 3, 1,
				3, 9, 3, 2, 6, 9, 3, 2, 1, 2, 3, 8, 4, 5, 3, 7, 4, 6, 4, 5, 5, 6, 5, 3, 5, 8, 11, 10, 9, 14, 3,
			]
		),
	},
	{
		c: "び",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				258, 2, 16, 1, 1, 11, 3, 3, 1, 2, 1, 10, 3, 6, 1, 1, 1, 7, 4, 4, 7, 4, 6, 3, 6, 4, 7, 4, 5, 3, 8, 4, 4, 3, 9, 5, 3, 3, 9, 6, 1, 4, 9,
				10, 10, 10, 9, 4, 1, 2, 1, 3, 9, 4, 2, 1, 1, 3, 9, 3, 5, 3, 8, 4, 6, 3, 6, 4, 7, 5, 3, 5, 8, 11, 10, 9,
			]
		),
	},
	{
		c: "ぴ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				269, 2, 18, 14, 3, 3, 1, 2, 1, 12, 2, 9, 1, 8, 4, 7, 4, 4, 6, 3, 8, 3, 7, 4, 6, 3, 8, 5, 5, 3, 8, 5, 4, 3, 9, 6, 3, 3, 9, 7, 2, 3, 9,
				3, 1, 3, 1, 3, 10, 3, 1, 3, 1, 3, 9, 4, 2, 1, 2, 3, 9, 4, 6, 3, 7, 4, 7, 3, 6, 5, 7, 5, 2, 6, 9, 11, 11, 9, 16, 2,
			]
		),
	},
	{
		c: "ふ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				279, 3, 18, 8, 12, 11, 14, 6, 19, 2, 36, 1, 19, 3, 17, 6, 4, 1, 6, 3, 3, 5, 2, 3, 5, 3, 4, 4, 2, 3, 4, 3, 6, 4, 2, 3, 3, 3, 7, 3, 2,
				3, 3, 3, 7, 3, 2, 4, 1, 4, 7, 3, 3, 3, 1, 3, 2, 1, 4, 4, 3, 7, 1, 10, 3, 6, 2, 9, 4, 1, 8, 7,
			]
		),
	},
	{
		c: "ぷ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				279, 2, 18, 8, 14, 8, 3, 3, 10, 9, 1, 1, 14, 1, 2, 2, 1, 2, 17, 3, 18, 2, 9, 3, 18, 5, 12, 2, 4, 4, 2, 3, 5, 3, 5, 3, 3, 3, 4, 2, 7,
				3, 2, 3, 4, 2, 7, 3, 3, 2, 3, 3, 7, 3, 3, 3, 2, 3, 7, 3, 3, 3, 1, 3, 8, 3, 3, 3, 1, 3, 2, 9, 4, 2, 1, 2, 3, 8, 14, 6,
			]
		),
	},
	{
		c: "へ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				325, 4, 15, 7, 12, 8, 12, 3, 2, 4, 10, 4, 3, 4, 8, 4, 5, 4, 7, 4, 6, 4, 5, 4, 7, 5, 4, 4, 8, 4, 4, 3, 10, 4, 4, 1, 12, 4, 17, 4, 16,
				5, 16, 4, 17, 3, 18, 1,
			]
		),
	},
	{
		c: "べ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				296, 1, 18, 3, 7, 4, 4, 2, 1, 3, 5, 7, 3, 2, 1, 2, 4, 8, 4, 2, 6, 3, 2, 4, 3, 1, 6, 4, 3, 4, 8, 4, 5, 4, 7, 4, 6, 4, 5, 4, 7, 5, 4, 3,
				9, 4, 4, 3, 10, 4, 4, 1, 12, 4, 17, 4, 16, 5, 16, 4, 17, 3, 18, 1,
			]
		),
	},
	{
		c: "ほ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				262, 2, 17, 4, 1, 13, 2, 3, 2, 13, 2, 3, 2, 13, 2, 3, 8, 4, 5, 3, 9, 3, 5, 3, 8, 4, 5, 3, 2, 13, 2, 3, 2, 13, 2, 3, 9, 3, 5, 3, 9, 3,
				5, 3, 9, 3, 4, 4, 4, 8, 4, 4, 2, 10, 4, 4, 2, 3, 3, 6, 3, 3, 2, 2, 4, 7, 2, 3, 2, 3, 2, 9, 1, 3, 2, 9, 2, 2, 2, 3, 3, 7, 4, 1,
			]
		),
	},
	{
		c: "ぼ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				242, 2, 1, 2, 1, 2, 12, 4, 1, 3, 1, 14, 1, 3, 1, 17, 2, 13, 1, 3, 9, 3, 4, 3, 9, 3, 4, 3, 8, 4, 4, 3, 2, 13, 1, 3, 2, 13, 1, 3, 9, 3,
				4, 3, 9, 3, 4, 3, 9, 3, 4, 3, 4, 8, 4, 3, 2, 11, 3, 3, 2, 3, 3, 6, 2, 3, 2, 2, 5, 10, 2, 3, 3, 11, 2, 9, 2, 2, 1, 3, 4, 6, 4, 1,
			]
		),
	},
	{
		c: "ぽ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				261, 3, 11, 4, 2, 3, 1, 12, 1, 6, 1, 12, 1, 5, 2, 14, 1, 3, 9, 3, 5, 3, 9, 3, 5, 3, 8, 4, 5, 3, 2, 13, 2, 3, 2, 14, 1, 3, 9, 3, 5, 3,
				9, 3, 5, 3, 9, 3, 5, 3, 4, 8, 5, 3, 2, 11, 4, 3, 2, 3, 3, 6, 3, 3, 2, 2, 5, 7, 1, 3, 2, 3, 3, 8, 1, 3, 2, 9, 2, 2, 2, 3, 3, 7, 4, 1,
			]
		),
	},
	{
		c: "ま",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				242, 3, 15, 3, 7, 17, 1, 18, 1, 16, 9, 3, 15, 3, 8, 16, 2, 16, 2, 16, 9, 3, 15, 3, 10, 8, 8, 12, 5, 4, 3, 8, 3, 3, 5, 8, 2, 3, 4, 4,
				2, 4, 2, 9, 4, 3, 3, 7,
			]
		),
	},
	{
		c: "み",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				268, 5, 11, 9, 11, 9, 16, 4, 16, 3, 16, 4, 3, 3, 10, 3, 4, 3, 10, 3, 4, 3, 6, 8, 3, 3, 4, 16, 3, 17, 3, 3, 2, 3, 4, 10, 2, 4, 5, 8, 3,
				3, 6, 9, 1, 4, 5, 3, 3, 8, 5, 4, 4, 6, 5, 4, 6, 4, 3, 6, 14, 5, 16, 2,
			]
		),
	},
	{
		c: "み",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				271, 1, 12, 9, 11, 9, 16, 3, 17, 3, 16, 3, 5, 2, 10, 3, 4, 3, 10, 3, 4, 3, 6, 8, 3, 3, 5, 15, 4, 16, 3, 3, 1, 4, 4, 6, 1, 3, 2, 3, 6,
				8, 3, 3, 6, 9, 1, 3, 6, 3, 4, 7, 5, 4, 5, 5, 5, 4, 6, 3, 5, 5, 14, 5, 16, 2,
			]
		),
	},
	{
		c: "む",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				265, 3, 17, 3, 6, 1, 5, 12, 1, 4, 3, 12, 1, 5, 2, 12, 3, 5, 5, 3, 8, 4, 5, 3, 9, 3, 2, 6, 10, 1, 2, 7, 13, 3, 1, 3, 12, 3, 2, 3, 6, 3,
				3, 3, 2, 3, 6, 4, 2, 3, 1, 3, 8, 3, 3, 6, 8, 4, 2, 5, 9, 4, 4, 3, 9, 3, 5, 4, 6, 5, 6, 14, 7, 12, 10, 7,
			]
		),
	},
	{
		c: "め",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				273, 2, 8, 3, 6, 3, 8, 3, 6, 3, 8, 3, 2, 7, 9, 12, 7, 14, 6, 4, 3, 3, 2, 3, 4, 5, 3, 3, 3, 3, 2, 6, 2, 3, 4, 3, 2, 6, 2, 3, 5, 2, 1,
				3, 2, 6, 6, 6, 2, 6, 6, 6, 2, 5, 7, 6, 3, 4, 6, 3, 1, 3, 2, 4, 7, 3, 1, 10, 4, 4, 3, 8, 3, 6, 4, 4, 4, 6, 14, 5,
			]
		),
	},
	{
		c: "も",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				252, 3, 16, 3, 15, 4, 15, 3, 13, 12, 7, 12, 7, 12, 10, 3, 16, 3, 6, 4, 6, 3, 7, 3, 2, 13, 1, 4, 1, 13, 2, 3, 2, 12, 2, 4, 4, 3, 9, 3,
				4, 3, 9, 3, 4, 3, 8, 4, 4, 4, 6, 4, 6, 12, 8, 10, 11, 6,
			]
		),
	},
	{
		c: "ゃ",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				293, 1, 2, 3, 9, 3, 3, 3, 9, 2, 3, 4, 1, 1, 6, 3, 1, 8, 5, 14, 1, 7, 6, 10, 7, 3, 1, 2, 1, 3, 7, 3, 4, 3, 5, 4, 6, 2, 1, 8, 6, 3, 1,
				5, 8, 3, 14, 3, 15, 3, 14, 3, 14, 3,
			]
		),
	},
	{
		c: "や",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				269, 3, 10, 4, 3, 3, 11, 3, 4, 3, 10, 3, 4, 8, 5, 3, 2, 11, 4, 17, 2, 9, 5, 12, 9, 11, 9, 6, 2, 3, 8, 4, 5, 3, 7, 5, 5, 3, 2, 9, 6, 4,
				1, 8, 8, 3, 1, 6, 10, 3, 17, 4, 17, 3, 17, 3, 17, 4, 16, 3,
			]
		),
	},
	{
		c: "ゅ",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				280, 2, 7, 1, 6, 3, 5, 3, 3, 7, 3, 3, 2, 9, 2, 7, 1, 3, 1, 3, 1, 6, 2, 3, 2, 2, 1, 5, 3, 3, 2, 7, 4, 3, 2, 7, 4, 3, 2, 6, 5, 2, 3, 6,
				1, 6, 2, 3, 1, 3, 2, 10, 2, 1, 3, 9, 6, 8, 7, 4, 13, 1,
			]
		),
	},
	{
		c: "ゆ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				270, 3, 8, 3, 6, 3, 7, 4, 5, 6, 5, 4, 3, 10, 3, 3, 2, 13, 2, 3, 2, 3, 2, 3, 2, 4, 1, 3, 1, 3, 3, 3, 3, 3, 1, 6, 4, 3, 3, 9, 5, 3, 3,
				9, 5, 3, 4, 7, 6, 3, 3, 8, 6, 3, 3, 3, 1, 4, 1, 2, 2, 4, 3, 3, 1, 3, 2, 3, 1, 4, 2, 4, 1, 3, 2, 7, 1, 5, 2, 3, 3, 11, 9, 10, 7, 11, 9,
				6, 15, 2,
			]
		),
	},
	{
		c: "ゆ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				270, 3, 8, 3, 6, 3, 7, 4, 5, 6, 5, 4, 3, 10, 3, 3, 2, 13, 2, 3, 2, 3, 2, 3, 2, 4, 1, 3, 1, 3, 3, 3, 3, 3, 1, 6, 4, 3, 3, 10, 4, 3, 3,
				9, 5, 3, 4, 7, 6, 3, 3, 8, 6, 3, 3, 8, 1, 2, 2, 4, 3, 3, 1, 3, 2, 3, 1, 4, 2, 4, 1, 3, 2, 7, 1, 5, 2, 3, 3, 11, 9, 10, 7, 11, 9, 6,
				15, 2,
			]
		),
	},
	{
		c: "ょ",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[244, 3, 11, 3, 11, 3, 11, 8, 6, 8, 6, 8, 6, 3, 11, 3, 11, 3, 6, 8, 5, 11, 3, 2, 4, 7, 1, 3, 3, 16, 3, 3, 1, 6, 5, 2]
		),
	},
	{
		c: "よ",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				242, 3, 15, 3, 15, 3, 15, 3, 15, 10, 8, 10, 8, 10, 8, 3, 15, 3, 15, 3, 15, 3, 9, 9, 8, 11, 6, 14, 4, 3, 5, 8, 2, 3, 4, 4, 1, 11, 1, 5,
				2, 15, 5, 3, 2, 7, 7, 1,
			]
		),
	},
	{
		c: "ら",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				237, 7, 11, 11, 6, 11, 14, 4, 6, 2, 16, 3, 15, 3, 15, 3, 15, 3, 2, 9, 4, 15, 2, 17, 1, 6, 8, 8, 10, 4, 2, 1, 11, 4, 14, 4, 12, 5, 2,
				15, 4, 13, 5, 11,
			]
		),
	},
	{
		c: "ら",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				224, 7, 10, 10, 7, 10, 14, 2, 6, 2, 15, 2, 15, 2, 15, 2, 15, 2, 3, 8, 3, 16, 1, 10, 2, 4, 1, 5, 9, 7, 10, 3, 14, 3, 14, 3, 12, 5, 2,
				4, 1, 9, 3, 12, 5, 11,
			]
		),
	},
	{
		c: "り",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				197, 2, 5, 2, 5, 3, 3, 6, 3, 3, 2, 8, 2, 3, 1, 4, 2, 3, 2, 6, 5, 3, 1, 5, 6, 3, 1, 5, 6, 3, 1, 4, 7, 8, 7, 7, 8, 7, 8, 7, 8, 3, 1, 3,
				8, 3, 1, 2, 8, 4, 11, 3, 10, 5, 7, 7, 5, 9, 5, 7, 9, 3,
			]
		),
	},
	{
		c: "る",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				269, 13, 6, 13, 6, 13, 13, 4, 13, 5, 13, 4, 13, 5, 1, 2, 10, 12, 5, 16, 1, 7, 7, 4, 1, 5, 10, 4, 1, 2, 3, 1, 8, 4, 3, 6, 6, 4, 2, 8,
				5, 4, 2, 3, 3, 3, 3, 4, 3, 4, 2, 3, 2, 5, 4, 14, 6, 11, 11, 4,
			]
		),
	},
	{
		c: "れ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				278, 3, 18, 3, 18, 3, 6, 2, 10, 3, 4, 5, 6, 6, 2, 8, 4, 7, 1, 9, 4, 11, 3, 3, 8, 6, 3, 4, 8, 5, 5, 3, 7, 5, 5, 4, 6, 5, 6, 3, 7, 5, 6,
				3, 6, 6, 6, 3, 6, 6, 6, 3, 5, 3, 1, 3, 6, 3, 3, 5, 1, 3, 6, 7, 1, 2, 2, 3, 6, 7, 1, 2, 2, 3, 7, 6, 5, 3, 18, 3,
			]
		),
	},
	{
		c: "ろ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				269, 13, 6, 13, 6, 13, 13, 5, 13, 4, 13, 5, 13, 4, 13, 13, 5, 15, 2, 8, 4, 12, 9, 4, 1, 3, 12, 3, 16, 3, 15, 4, 14, 5, 3, 5, 2, 8, 4,
				14, 5, 12, 10, 4,
			]
		),
	},
	{
		c: "わ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				264, 3, 17, 3, 17, 3, 17, 3, 17, 3, 4, 4, 6, 6, 1, 9, 4, 17, 5, 8, 4, 4, 4, 6, 7, 3, 4, 4, 9, 3, 4, 4, 10, 3, 2, 5, 10, 3, 1, 6, 9, 4,
				1, 2, 1, 3, 9, 3, 1, 3, 1, 3, 8, 4, 1, 2, 2, 3, 6, 5, 2, 2, 2, 3, 2, 8, 7, 3, 2, 7, 8, 3, 3, 3, 12, 1,
			]
		),
	},
	{
		c: "を",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				267, 4, 16, 4, 10, 16, 4, 16, 4, 2, 2, 4, 1, 2, 1, 2, 1, 1, 8, 3, 16, 8, 12, 9, 4, 3, 3, 5, 2, 10, 2, 4, 4, 10, 1, 4, 4, 7, 4, 4, 3,
				7, 7, 2, 3, 8, 11, 4, 2, 3, 11, 3, 3, 3, 10, 4, 17, 3, 9, 1, 7, 13, 8, 12, 13, 5,
			]
		),
	},
	{
		c: "ん",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				280, 4, 17, 4, 17, 3, 17, 4, 17, 3, 17, 4, 17, 3, 17, 4, 17, 3, 18, 8, 6, 2, 4, 9, 6, 3, 3, 5, 1, 3, 5, 4, 2, 5, 3, 3, 4, 3, 3, 4, 4,
				3, 3, 4, 3, 3, 5, 3, 3, 4, 2, 4, 5, 3, 2, 4, 3, 3, 6, 9, 2, 4, 6, 8, 3, 4, 7, 6,
			]
		),
	},
	{ c: "ゝ", data: ImageHelper.fromJsonBinarized(12, 43, [193, 2, 9, 4, 9, 4, 8, 4, 9, 5, 8, 5, 8, 5, 8, 5, 8, 6, 6, 6, 4, 7, 3, 6, 7, 3, 10, 1]) },
	{
		c: "ァ",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[270, 15, 1, 14, 12, 3, 12, 3, 5, 3, 3, 3, 6, 3, 3, 3, 6, 3, 1, 4, 7, 7, 8, 3, 1, 2, 8, 3, 11, 4, 10, 4, 9, 5, 10, 4]
		),
	},
	{
		c: "ア",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				281, 19, 1, 19, 1, 19, 16, 4, 16, 3, 9, 3, 4, 4, 9, 3, 3, 5, 9, 3, 2, 5, 9, 10, 10, 9, 11, 8, 12, 3, 2, 1, 13, 4, 15, 4, 14, 6, 12, 7,
				12, 7, 15, 3,
			]
		),
	},
	{
		c: "ィ",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[249, 3, 11, 3, 10, 3, 10, 3, 10, 3, 9, 4, 8, 6, 5, 9, 4, 10, 4, 4, 3, 3, 11, 3, 11, 3, 11, 3, 11, 3, 11, 3]
		),
	},
	{
		c: "イ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				262, 2, 16, 5, 13, 5, 13, 5, 13, 5, 13, 5, 12, 6, 12, 6, 11, 8, 9, 10, 6, 8, 1, 4, 6, 6, 3, 4, 7, 3, 5, 4, 15, 4, 15, 4, 15, 4, 15, 4,
				15, 4, 15, 4, 15, 4,
			]
		),
	},
	{
		c: "ウ",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[211, 1, 1, 1, 14, 3, 14, 3, 14, 3, 7, 54, 11, 6, 11, 6, 10, 7, 10, 7, 10, 7, 9, 4, 13, 4, 12, 4, 11, 6, 9, 7, 5, 11, 6, 9, 8, 7, 11, 3]
		),
	},
	{
		c: "ェ",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[289, 1, 3, 1, 2, 4, 2, 1, 2, 14, 2, 14, 7, 4, 12, 4, 12, 4, 12, 4, 12, 4, 12, 4, 12, 4, 12, 4, 6, 32]
		),
	},
	{
		c: "エ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[286, 17, 1, 18, 2, 17, 9, 3, 16, 3, 16, 3, 16, 3, 16, 3, 16, 3, 16, 3, 16, 3, 16, 3, 16, 3, 8, 57]
		),
	},
	{
		c: "ォ",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				281, 3, 14, 2, 13, 4, 3, 32, 7, 6, 9, 7, 9, 3, 1, 3, 8, 3, 2, 3, 6, 4, 3, 3, 5, 5, 3, 3, 3, 5, 5, 3, 3, 4, 6, 3, 4, 1, 4, 6, 10, 6,
				12, 2,
			]
		),
	},
	{
		c: "オ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				253, 3, 17, 3, 17, 3, 17, 3, 5, 19, 1, 19, 1, 19, 9, 7, 13, 7, 13, 3, 1, 3, 12, 4, 1, 3, 11, 4, 2, 3, 10, 4, 3, 3, 8, 5, 4, 3, 7, 5,
				5, 3, 5, 6, 6, 3, 4, 6, 7, 3, 5, 3, 4, 8, 6, 1, 5, 8, 13, 6, 14, 4,
			]
		),
	},
	{
		c: "カ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				255, 3, 16, 3, 16, 3, 16, 4, 9, 17, 2, 17, 6, 5, 4, 4, 8, 3, 5, 3, 7, 4, 5, 3, 7, 3, 6, 3, 7, 3, 6, 3, 6, 4, 6, 3, 6, 4, 5, 4, 5, 4,
				6, 3, 5, 4, 7, 3, 4, 5, 6, 4, 2, 6, 3, 8, 1, 6, 4, 7, 3, 3, 7, 5,
			]
		),
	},
	{
		c: "ガ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				242, 1, 1, 2, 7, 3, 5, 1, 2, 1, 7, 3, 5, 2, 1, 2, 6, 3, 16, 3, 10, 17, 2, 17, 8, 3, 5, 3, 8, 3, 5, 3, 8, 2, 6, 3, 7, 3, 6, 3, 7, 3, 6,
				2, 8, 3, 6, 2, 7, 3, 6, 3, 6, 4, 6, 3, 6, 3, 7, 3, 4, 4, 8, 3, 3, 4, 4, 8, 3, 3, 5, 7, 4, 2, 7, 4,
			]
		),
	},
	{
		c: "キ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[237, 1, 15, 4, 16, 3, 16, 3, 16, 11, 1, 18, 1, 18, 1, 12, 14, 4, 15, 4, 16, 3, 13, 63, 16, 3, 16, 4, 15, 4, 15, 4, 15, 4, 16, 3]
		),
	},
	{
		c: "ク",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				236, 1, 18, 4, 14, 4, 15, 12, 6, 13, 6, 13, 5, 4, 6, 4, 4, 4, 7, 4, 3, 5, 7, 4, 1, 6, 7, 4, 1, 6, 8, 4, 2, 4, 8, 4, 4, 1, 9, 5, 14, 4,
				13, 5, 13, 5, 12, 6, 9, 9, 9, 8, 11, 6, 14, 2,
			]
		),
	},
	{
		c: "グ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				267, 3, 5, 5, 7, 3, 5, 5, 6, 7, 2, 4, 7, 13, 6, 13, 6, 4, 7, 3, 5, 4, 8, 3, 4, 5, 7, 4, 3, 5, 8, 3, 3, 5, 8, 4, 4, 3, 9, 3, 16, 4, 15,
				4, 15, 4, 14, 5, 14, 5, 11, 8, 10, 8, 13, 5,
			]
		),
	},
	{
		c: "ケ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				252, 2, 16, 3, 16, 3, 16, 4, 14, 16, 3, 16, 2, 4, 4, 5, 5, 4, 6, 3, 5, 4, 7, 3, 5, 3, 8, 3, 6, 1, 9, 3, 15, 3, 16, 3, 15, 4, 14, 4,
				14, 4, 13, 5, 11, 7, 13, 4,
			]
		),
	},
	{
		c: "ゲ",
		data: ImageHelper.fromJsonBinarized(
			22,
			43,
			[
				280, 4, 7, 4, 7, 2, 1, 2, 6, 4, 8, 5, 5, 3, 9, 2, 8, 16, 5, 17, 5, 17, 4, 18, 3, 4, 6, 4, 7, 5, 6, 4, 6, 5, 7, 3, 9, 2, 7, 4, 18, 4,
				18, 4, 17, 4, 17, 4, 16, 6, 14, 7, 13, 8, 15, 5, 17, 2,
			]
		),
	},
	{
		c: "コ",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[271, 17, 1, 17, 1, 17, 14, 4, 14, 4, 14, 4, 14, 4, 14, 4, 14, 4, 14, 4, 14, 4, 14, 4, 14, 40, 1, 17, 14, 4]
		),
	},
	{
		c: "ゴ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				242, 2, 17, 5, 14, 5, 1, 16, 2, 17, 2, 17, 16, 3, 16, 3, 16, 3, 16, 3, 16, 3, 16, 3, 16, 3, 16, 3, 16, 3, 16, 3, 2, 17, 2, 17, 2, 17,
				16, 3,
			]
		),
	},
	{
		c: "サ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				264, 3, 6, 3, 8, 3, 6, 3, 8, 3, 6, 3, 8, 3, 6, 3, 4, 60, 4, 3, 6, 3, 8, 3, 6, 3, 8, 3, 6, 3, 8, 3, 6, 3, 8, 3, 5, 4, 8, 3, 5, 4, 15,
				4, 15, 5, 14, 5, 13, 6, 12, 7, 13, 5,
			]
		),
	},
	{
		c: "ザ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				268, 1, 2, 1, 7, 1, 6, 1, 1, 3, 1, 1, 5, 3, 7, 2, 3, 2, 4, 3, 6, 3, 9, 3, 6, 3, 9, 3, 6, 3, 6, 18, 2, 20, 5, 3, 6, 3, 9, 3, 6, 3, 9,
				3, 6, 3, 9, 3, 6, 3, 9, 2, 6, 3, 12, 1, 5, 3, 18, 3, 17, 3, 16, 5, 14, 6, 13, 6, 16, 4,
			]
		),
	},
	{
		c: "シ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				264, 1, 19, 3, 16, 7, 13, 8, 6, 1, 8, 4, 7, 2, 9, 2, 6, 4, 1, 3, 12, 11, 9, 3, 1, 8, 7, 4, 4, 5, 6, 4, 7, 2, 7, 4, 15, 4, 15, 4, 14,
				6, 12, 7, 11, 7, 8, 11, 10, 8, 12, 5, 16, 1,
			]
		),
	},
	{
		c: "ジ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				244, 1, 18, 2, 5, 2, 8, 2, 1, 1, 4, 6, 6, 1, 7, 6, 15, 4, 7, 2, 16, 3, 1, 2, 13, 8, 11, 3, 1, 6, 8, 3, 4, 4, 7, 4, 6, 1, 8, 3, 15, 4,
				14, 4, 14, 4, 13, 5, 12, 6, 8, 9, 10, 7, 12, 5,
			]
		),
	},
	{
		c: "ス",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				282, 15, 5, 15, 5, 15, 5, 14, 16, 4, 16, 4, 16, 3, 16, 4, 15, 4, 15, 5, 14, 7, 12, 9, 10, 5, 1, 6, 6, 6, 3, 6, 3, 7, 5, 14, 7, 5, 1,
				5, 10, 3, 3, 2, 13, 1,
			]
		),
	},
	{
		c: "セ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				265, 3, 17, 4, 16, 4, 16, 4, 16, 4, 4, 7, 5, 15, 1, 33, 2, 3, 1, 9, 6, 4, 2, 1, 3, 3, 6, 4, 7, 4, 5, 4, 7, 3, 4, 5, 8, 4, 2, 5, 9, 3,
				4, 3, 10, 4, 16, 4, 16, 15, 6, 13, 8, 12,
			]
		),
	},
	{
		c: "ソ",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				239, 2, 11, 7, 10, 7, 10, 3, 1, 4, 8, 4, 1, 4, 8, 4, 2, 4, 7, 3, 3, 4, 6, 4, 4, 3, 6, 4, 4, 2, 7, 3, 13, 4, 12, 4, 12, 5, 11, 5, 10,
				6, 9, 7, 7, 9, 8, 7, 11, 4, 14, 1,
			]
		),
	},
	{
		c: "ゾ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				254, 2, 1, 2, 15, 2, 1, 2, 2, 3, 11, 2, 1, 6, 10, 4, 3, 4, 9, 3, 4, 4, 9, 3, 5, 4, 7, 4, 5, 4, 7, 4, 6, 4, 6, 3, 7, 4, 5, 4, 7, 2, 7,
				4, 15, 4, 15, 5, 15, 4, 14, 5, 14, 6, 11, 7, 11, 8, 12, 6, 14, 4,
			]
		),
	},
	{
		c: "タ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				236, 1, 18, 3, 15, 4, 15, 12, 6, 13, 5, 14, 4, 4, 8, 3, 3, 5, 7, 4, 2, 5, 8, 3, 2, 5, 1, 3, 5, 3, 1, 5, 1, 5, 3, 4, 2, 3, 3, 10, 11,
				8, 12, 6, 13, 5, 13, 5, 12, 6, 11, 7, 8, 9, 11, 7, 13, 2,
			]
		),
	},
	{
		c: "ダ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				268, 1, 1, 2, 9, 3, 5, 1, 2, 1, 8, 3, 6, 2, 1, 2, 7, 3, 6, 2, 9, 13, 8, 13, 7, 3, 8, 3, 6, 3, 9, 2, 6, 3, 9, 3, 5, 4, 2, 1, 6, 3, 3,
				4, 3, 4, 3, 3, 5, 2, 5, 4, 2, 3, 13, 7, 16, 5, 16, 4, 16, 4, 15, 5, 14, 6, 11, 8, 13, 6,
			]
		),
	},
	{
		c: "チ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[273, 3, 5, 16, 4, 17, 4, 13, 7, 5, 1, 4, 17, 3, 17, 3, 8, 60, 8, 4, 17, 3, 16, 4, 16, 3, 16, 4, 14, 5, 12, 7, 12, 7, 14, 5, 16, 1]
		),
	},
	{
		c: "ッ",
		data: ImageHelper.fromJsonBinarized(
			14,
			43,
			[252, 2, 3, 2, 5, 5, 2, 3, 3, 6, 2, 3, 3, 6, 2, 3, 3, 6, 3, 3, 2, 2, 2, 2, 3, 2, 2, 3, 11, 3, 10, 3, 10, 4, 9, 4, 9, 4, 7, 6, 7, 6, 8, 4]
		),
	},
	{
		c: "ツ",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				254, 1, 3, 4, 5, 6, 3, 4, 5, 7, 3, 3, 4, 8, 3, 4, 3, 4, 1, 3, 3, 4, 3, 4, 1, 4, 2, 4, 3, 4, 1, 4, 3, 3, 2, 4, 3, 3, 3, 2, 3, 4, 3, 1,
				10, 4, 13, 4, 13, 5, 12, 5, 12, 5, 12, 5, 10, 7, 8, 9, 9, 7, 12, 4,
			]
		),
	},
	{
		c: "テ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[264, 1, 10, 1, 6, 15, 5, 15, 5, 15, 43, 60, 8, 4, 16, 4, 16, 4, 16, 4, 15, 4, 15, 5, 14, 5, 13, 6, 12, 7, 14, 5, 16, 2]
		),
	},
	{
		c: "ト",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				208, 3, 13, 3, 13, 3, 13, 3, 13, 3, 13, 4, 12, 7, 9, 10, 6, 13, 3, 3, 3, 9, 1, 3, 5, 11, 8, 8, 10, 2, 1, 3, 13, 3, 13, 3, 13, 3, 13,
				3, 13, 3, 13, 3,
			]
		),
	},
	{
		c: "ト",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				221, 4, 13, 4, 14, 3, 14, 3, 14, 3, 14, 3, 14, 7, 10, 10, 7, 13, 4, 3, 2, 10, 2, 3, 5, 8, 1, 3, 8, 4, 2, 3, 10, 2, 2, 3, 14, 3, 14, 3,
				14, 3, 14, 3, 14, 3, 14, 3,
			]
		),
	},
	{
		c: "ド",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				222, 3, 7, 2, 5, 3, 6, 1, 1, 3, 3, 3, 5, 3, 1, 2, 3, 3, 6, 3, 4, 4, 7, 2, 5, 3, 13, 8, 10, 10, 7, 13, 4, 3, 2, 10, 2, 3, 5, 8, 1, 3,
				7, 5, 2, 3, 10, 2, 2, 3, 14, 3, 14, 3, 14, 3, 14, 3, 13, 4, 14, 3,
			]
		),
	},
	{
		c: "ド",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[
				208, 3, 8, 2, 3, 4, 7, 3, 2, 3, 6, 2, 1, 3, 1, 4, 6, 2, 1, 1, 2, 4, 7, 2, 3, 4, 12, 7, 9, 10, 6, 13, 3, 3, 3, 9, 1, 3, 5, 11, 8, 8,
				10, 2, 1, 3, 13, 3, 13, 3, 13, 3, 13, 3, 13, 3, 13, 3,
			]
		),
	},
	{
		c: "ナ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[269, 3, 17, 3, 17, 3, 17, 3, 17, 3, 8, 60, 9, 3, 16, 4, 16, 4, 16, 4, 16, 3, 16, 4, 15, 4, 14, 5, 13, 7, 12, 6, 15, 3]
		),
	},
	{ c: "ニ", data: ImageHelper.fromJsonBinarized(20, 43, [302, 15, 5, 16, 4, 16, 4, 16, 162, 19, 1, 59]) },
	{
		c: "ヌ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				269, 16, 3, 16, 3, 15, 15, 4, 15, 4, 7, 2, 6, 4, 6, 5, 3, 4, 7, 6, 2, 4, 8, 10, 11, 7, 13, 7, 12, 8, 10, 10, 7, 6, 2, 5, 3, 8, 4, 3,
				1, 10, 6, 2, 2, 7, 12, 4, 16, 1,
			]
		),
	},
	{
		c: "ネ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				248, 3, 17, 4, 16, 4, 10, 11, 1, 3, 4, 16, 4, 16, 5, 14, 16, 4, 15, 4, 15, 4, 15, 4, 14, 5, 2, 2, 9, 7, 1, 5, 5, 9, 1, 19, 3, 11, 2,
				4, 4, 4, 1, 3, 4, 4, 6, 1, 9, 4, 16, 4, 16, 4, 16, 4,
			]
		),
	},
	{
		c: "ノ",
		data: ImageHelper.fromJsonBinarized(
			16,
			43,
			[237, 3, 12, 4, 12, 4, 12, 3, 12, 4, 12, 4, 12, 3, 12, 4, 11, 4, 12, 4, 11, 4, 11, 4, 11, 5, 9, 6, 9, 5, 9, 6, 9, 6, 11, 3]
		),
	},
	{
		c: "ハ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				308, 1, 11, 4, 3, 4, 10, 3, 4, 4, 10, 3, 5, 4, 9, 3, 5, 4, 8, 4, 6, 3, 8, 4, 6, 4, 7, 3, 7, 4, 7, 3, 8, 4, 5, 4, 8, 4, 5, 4, 8, 4, 5,
				3, 10, 4, 3, 4, 10, 4, 3, 4, 10, 4, 2, 4, 12, 3, 1, 5, 12, 8, 13, 3, 3, 2,
			]
		),
	},
	{
		c: "バ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				270, 2, 17, 2, 1, 2, 14, 1, 1, 2, 1, 2, 5, 4, 3, 4, 1, 2, 7, 4, 3, 4, 10, 4, 4, 4, 9, 3, 5, 4, 9, 3, 6, 3, 8, 4, 6, 4, 7, 4, 7, 3, 7,
				3, 8, 4, 5, 4, 8, 4, 5, 4, 9, 3, 5, 3, 10, 4, 3, 4, 10, 4, 3, 4, 10, 4, 2, 4, 12, 4, 1, 4, 12, 8, 13, 3, 3, 2,
			]
		),
	},
	{
		c: "パ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				268, 3, 18, 4, 16, 2, 2, 1, 6, 3, 4, 5, 1, 3, 5, 3, 4, 8, 5, 4, 4, 5, 8, 3, 6, 4, 8, 3, 6, 4, 8, 3, 7, 3, 8, 3, 7, 4, 6, 3, 8, 4, 6,
				3, 9, 3, 6, 3, 9, 4, 4, 3, 10, 4, 4, 3, 11, 3, 3, 4, 11, 4, 2, 3, 12, 4, 1, 4, 12, 4, 1, 3, 14, 2,
			]
		),
	},
	{
		c: "パ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				268, 3, 18, 4, 16, 2, 2, 1, 6, 3, 4, 5, 1, 3, 5, 3, 4, 8, 5, 4, 4, 5, 8, 3, 6, 4, 8, 3, 6, 4, 8, 3, 7, 3, 8, 3, 7, 4, 6, 3, 8, 4, 6,
				3, 9, 3, 6, 3, 9, 4, 4, 3, 10, 4, 4, 3, 11, 3, 3, 4, 11, 4, 2, 3, 12, 4, 1, 4, 12, 4, 1, 3, 14, 2,
			]
		),
	},
	{
		c: "ヒ",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				221, 3, 14, 4, 13, 4, 13, 4, 8, 3, 2, 4, 6, 6, 1, 4, 4, 8, 1, 4, 1, 9, 3, 12, 5, 10, 7, 7, 10, 4, 13, 3, 14, 3, 14, 3, 14, 4, 13, 5,
				7, 5, 1, 16, 1, 16, 3, 13,
			]
		),
	},
	{
		c: "ビ",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[
				231, 2, 1, 3, 10, 2, 1, 5, 10, 3, 1, 4, 11, 2, 2, 3, 9, 2, 1, 1, 2, 3, 7, 4, 4, 3, 5, 7, 3, 3, 3, 8, 4, 12, 6, 10, 8, 7, 11, 4, 14, 3,
				15, 3, 15, 3, 15, 3, 15, 4, 9, 4, 1, 16, 3, 15, 5, 13,
			]
		),
	},
	{
		c: "フ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[266, 57, 15, 3, 15, 4, 15, 4, 15, 4, 15, 3, 15, 4, 14, 4, 15, 4, 14, 4, 13, 6, 11, 7, 10, 7, 9, 9, 10, 7, 13, 4]
		),
	},
	{
		c: "ブ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				254, 2, 1, 2, 15, 2, 1, 2, 16, 2, 1, 21, 1, 18, 2, 17, 17, 3, 16, 4, 16, 4, 16, 3, 16, 4, 16, 4, 15, 4, 15, 5, 14, 5, 13, 6, 12, 7,
				10, 9, 10, 8, 13, 5, 16, 1,
			]
		),
	},
	{
		c: "プ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				256, 3, 16, 5, 2, 14, 3, 40, 2, 1, 4, 1, 7, 4, 16, 4, 16, 3, 17, 3, 16, 4, 15, 4, 16, 4, 15, 4, 15, 5, 14, 5, 14, 5, 12, 7, 10, 9, 11,
				7, 14, 4,
			]
		),
	},
	{
		c: "ホ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				269, 3, 17, 3, 17, 3, 9, 18, 2, 19, 1, 19, 9, 3, 17, 3, 11, 2, 4, 3, 2, 3, 6, 3, 3, 3, 2, 3, 5, 4, 3, 3, 2, 4, 4, 4, 3, 3, 3, 3, 4, 3,
				4, 3, 3, 4, 2, 4, 4, 3, 4, 4, 1, 4, 4, 3, 4, 8, 5, 3, 5, 7, 1, 7, 5, 3, 1, 2, 2, 7, 5, 1, 8, 5,
			]
		),
	},
	{
		c: "ボ",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				267, 2, 1, 2, 10, 3, 4, 2, 1, 1, 10, 3, 4, 2, 1, 2, 9, 4, 4, 1, 4, 19, 2, 19, 2, 19, 10, 4, 17, 4, 17, 4, 3, 1, 7, 4, 2, 4, 1, 4, 6,
				3, 3, 4, 2, 3, 6, 3, 3, 4, 2, 4, 4, 4, 3, 3, 4, 3, 4, 3, 4, 4, 3, 4, 2, 4, 4, 4, 4, 3, 2, 4, 4, 3, 5, 8, 2, 6, 5, 3, 3, 2, 2, 6, 15,
				5,
			]
		),
	},
	{
		c: "マ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[285, 57, 15, 4, 14, 4, 14, 5, 5, 1, 8, 4, 5, 4, 5, 4, 6, 5, 3, 4, 8, 10, 10, 8, 12, 6, 14, 5, 15, 5, 15, 5, 15, 4, 16, 2]
		),
	},
	{
		c: "ミ",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[254, 11, 6, 16, 3, 15, 11, 7, 40, 7, 10, 13, 5, 14, 11, 7, 15, 2, 22, 5, 12, 11, 7, 15, 7, 14, 9, 9, 13, 4, 17, 1]
		),
	},
	{
		c: "ム",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				267, 1, 19, 4, 16, 3, 16, 4, 16, 4, 16, 3, 16, 4, 16, 4, 16, 3, 4, 3, 9, 4, 4, 4, 8, 4, 4, 5, 7, 3, 6, 4, 6, 4, 7, 4, 5, 4, 7, 4, 5,
				3, 5, 8, 1, 53, 3, 8, 13, 2,
			]
		),
	},
	{
		c: "メ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				261, 2, 17, 4, 15, 3, 15, 4, 7, 2, 6, 4, 6, 5, 3, 4, 7, 6, 2, 4, 9, 9, 11, 8, 13, 6, 13, 7, 11, 9, 9, 5, 1, 5, 7, 5, 3, 5, 5, 5, 5, 4,
				3, 6, 7, 2, 3, 6, 11, 7, 13, 4, 16, 1,
			]
		),
	},
	{
		c: "モ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[267, 17, 2, 17, 2, 17, 7, 4, 15, 4, 15, 4, 15, 4, 9, 57, 6, 4, 15, 4, 15, 4, 15, 4, 15, 4, 8, 1, 6, 13, 7, 12, 8, 11]
		),
	},
	{
		c: "ャ",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[259, 2, 13, 2, 13, 2, 12, 37, 2, 3, 4, 3, 5, 3, 5, 2, 4, 3, 6, 2, 3, 4, 6, 2, 2, 4, 7, 2, 2, 3, 8, 2, 13, 3, 12, 3, 12, 3, 13, 1]
		),
	},
	{
		c: "ヤ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[
				265, 4, 16, 4, 17, 3, 17, 3, 9, 2, 5, 49, 2, 4, 1, 8, 7, 3, 7, 3, 7, 3, 7, 4, 5, 4, 8, 3, 4, 4, 9, 3, 3, 5, 9, 3, 2, 5, 10, 3, 2, 4,
				11, 3, 17, 3, 17, 3, 17, 3, 17, 4, 17, 2,
			]
		),
	},
	{
		c: "ユ",
		data: ImageHelper.fromJsonBinarized(
			20,
			43,
			[282, 1, 1, 2, 1, 2, 2, 2, 1, 1, 6, 16, 4, 15, 5, 15, 17, 3, 16, 4, 16, 4, 16, 4, 16, 4, 16, 4, 16, 4, 16, 4, 16, 4, 16, 4, 4, 60]
		),
	},
	{ c: "ョ", data: ImageHelper.fromJsonBinarized(14, 43, [252, 42, 11, 3, 11, 3, 1, 13, 1, 13, 1, 13, 11, 3, 11, 3, 11, 45]) },
	{
		c: "ヨ",
		data: ImageHelper.fromJsonBinarized(17, 43, [238, 51, 14, 3, 14, 3, 14, 3, 14, 3, 1, 16, 1, 16, 1, 16, 14, 3, 14, 3, 14, 3, 14, 54, 14, 3]),
	},
	{
		c: "ラ",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[236, 14, 3, 15, 3, 15, 8, 2, 5, 1, 40, 53, 15, 3, 14, 4, 14, 4, 13, 4, 13, 5, 12, 5, 11, 6, 7, 10, 7, 9, 9, 7, 12, 2]
		),
	},
	{
		c: "リ",
		data: ImageHelper.fromJsonBinarized(
			15,
			43,
			[
				195, 4, 7, 3, 1, 4, 7, 3, 1, 4, 7, 3, 1, 4, 7, 3, 1, 4, 7, 8, 7, 8, 7, 8, 7, 8, 7, 8, 7, 3, 1, 4, 7, 3, 1, 4, 6, 4, 11, 4, 10, 4, 10,
				5, 9, 5, 6, 9, 4, 9, 7, 6, 10, 3,
			]
		),
	},
	{
		c: "ル",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				277, 3, 3, 3, 12, 3, 3, 3, 12, 3, 3, 3, 12, 3, 3, 3, 12, 3, 3, 3, 12, 3, 3, 3, 12, 3, 3, 3, 12, 3, 3, 3, 5, 1, 6, 3, 3, 3, 4, 3, 5, 3,
				3, 3, 4, 4, 4, 3, 3, 3, 3, 4, 4, 4, 3, 3, 3, 4, 4, 3, 4, 3, 2, 4, 4, 4, 4, 3, 1, 4, 5, 4, 4, 7, 5, 4, 5, 7, 4, 5, 5, 5, 6, 4, 6, 4, 8,
				2, 7, 2,
			]
		),
	},
	{
		c: "レ",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[
				221, 3, 14, 4, 13, 4, 13, 4, 13, 4, 13, 4, 13, 4, 11, 1, 1, 4, 10, 6, 10, 7, 10, 7, 9, 4, 1, 3, 7, 6, 1, 3, 6, 6, 2, 3, 5, 6, 3, 3, 2,
				8, 4, 11, 6, 9, 8, 7, 10, 5,
			]
		),
	},
	{
		c: "ロ",
		data: ImageHelper.fromJsonBinarized(
			18,
			43,
			[261, 1, 3, 1, 1, 1, 2, 53, 1, 3, 11, 3, 1, 3, 11, 7, 11, 7, 11, 7, 11, 7, 11, 7, 11, 7, 11, 7, 11, 7, 11, 21, 1, 17, 1, 21, 11, 3]
		),
	},
	{ c: "ヮ", data: ImageHelper.fromJsonBinarized(13, 43, [234, 29, 7, 5, 9, 4, 8, 5, 8, 5, 8, 3, 10, 2, 10, 3, 9, 3, 9, 4, 7, 5, 5, 6, 7, 5]) },
	{
		c: "ワ",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[238, 54, 10, 7, 11, 6, 11, 6, 10, 7, 10, 7, 10, 3, 1, 1, 1, 1, 9, 4, 13, 4, 12, 4, 12, 5, 11, 5, 10, 6, 8, 8, 7, 8, 10, 5, 13, 1]
		),
	},
	{
		c: "ヲ",
		data: ImageHelper.fromJsonBinarized(
			17,
			43,
			[238, 51, 13, 4, 13, 4, 13, 3, 1, 16, 1, 16, 1, 16, 12, 4, 13, 4, 12, 4, 12, 4, 11, 5, 10, 6, 8, 8, 7, 9, 9, 5, 13, 1]
		),
	},
	{
		c: "ン",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				268, 1, 17, 4, 14, 7, 9, 2, 3, 6, 8, 3, 3, 6, 6, 4, 4, 4, 7, 4, 6, 1, 7, 4, 15, 4, 14, 4, 14, 5, 14, 4, 13, 5, 13, 6, 11, 7, 9, 8, 8,
				10, 9, 8, 12, 4,
			]
		),
	},
	{
		c: "ヴ",
		data: ImageHelper.fromJsonBinarized(
			19,
			43,
			[
				242, 4, 8, 3, 4, 5, 7, 3, 4, 2, 1, 2, 6, 4, 5, 1, 3, 17, 2, 17, 2, 17, 2, 3, 11, 3, 2, 3, 11, 3, 2, 3, 11, 3, 2, 3, 10, 4, 2, 3, 10,
				3, 15, 4, 15, 3, 15, 4, 14, 4, 13, 5, 11, 7, 9, 8, 12, 5,
			]
		),
	},
	{ c: "ー", data: ImageHelper.fromJsonBinarized(20, 43, [420, 60]) },
	{
		c: "全",
		data: ImageHelper.fromJsonBinarized(
			21,
			43,
			[
				261, 3, 17, 5, 15, 7, 13, 9, 11, 4, 3, 4, 8, 6, 4, 5, 4, 6, 7, 6, 1, 6, 9, 6, 1, 4, 12, 4, 1, 1, 1, 15, 1, 2, 3, 15, 6, 15, 12, 3, 18,
				3, 18, 3, 18, 3, 18, 3, 11, 1, 1, 1, 1, 1, 1, 8, 2, 2, 2, 20, 1, 20,
			]
		),
	},
]

module.exports = { ImageHelper }
