import argparse
import time
import cv2
import os
import sys
import keyboard
from datetime import datetime
from threading import Thread

# Template
x = cv2.imread("./samples/x.jpg")

# Variables
roundNbr = 1
maxRoundNbr = 12
manualCapturePath = os.path.join(os.getcwd(), "manual_capture")

# Parse arguments: 
parser=argparse.ArgumentParser()
parser.add_argument('--name', help='Change Folder Name (Default: Current Date)')
parser.add_argument('--max', help='Change Max Round Number (Default: 12)')
parser.add_argument('--card', help='Change Capture Card Index (Default: 1)')
parser.add_argument('--debug', help='Show the cv2 screen (Default: false)', dest='debug', default=False, action='store_true')
args=parser.parse_args()

# --name
cwd = os.path.abspath(os.getcwd())
if args.name:
    folderName = str(args.name)
else:
    folderName = datetime.now().strftime('%d-%m-%Y_%H%M%S')

if not os.path.exists(manualCapturePath):
    os.mkdir(manualCapturePath)

if not os.path.exists(os.path.join(os.getcwd(), "war")):
    os.mkdir(os.path.join(os.getcwd(), "war"))

folderPath = os.path.join(str(cwd), "war", folderName)
if os.path.exists(folderPath):
    print("Folder name already exists.")
    sys.exit()
os.mkdir(folderPath)

# --max
if args.max:
    maxRoundNbr = int(args.max)

# --card
# Get Video from Capture Card (720p)
card = 1
if args.card:
    card = args.card
video = cv2.VideoCapture(int(card))
video.set(3, 1920)
video.set(4, 1080)

if not video.isOpened():
    print("Wrong capture card selected (" + str(card) + "). Try another index.")
    sys.exit()

# Start Web Server
os.system("start run_local_server.bat")

print("Capturing " + str(maxRoundNbr) + " Rounds In Folder: " + folderPath + "...")

def scanInput():
    while True:
        keyPressed = keyboard.read_key()
        if keyPressed == 'q' or roundNbr == maxRoundNbr + 1:
            video.release()
            cv2.destroyAllWindows()
            print("Capturing Ended.")
            sys.exit()

        if keyPressed == "c":
            success, img = video.read()
            cv2.resize(img, (1920, 1080))
            fileName = datetime.now().strftime('%d-%m-%Y_%H%M%S') + ".jpg"
            filePath = os.path.join(manualCapturePath, fileName)
            print("Manual Capture saved as '" + filePath + "'")
            cv2.imwrite(filePath, img)

def recognize():
    # Main loop
    while True:
        # Get one frame, resize and crop
        success, img = video.read()
        cv2.resize(img, (1920, 1080))

        cropped = img[57:57+48, 66:66+48]
        result = cv2.matchTemplate(cropped, x, cv2.TM_CCOEFF_NORMED)
        (minVal, maxVal, minLoc, maxLoc) = cv2.minMaxLoc(result)

        if args.debug:
            cv2.imshow("Result", img)
            cv2.imshow("cropped", cropped)

        # If matching template over 70%
        if(maxVal > 0.7):
            # Wait 3 seconds (animations, adding points...)
            time.sleep(3)

            # Get leaderboard and save it
            success, img = video.read()
            cv2.resize(img, (1920, 1080))
            fileName = "Round_" + str(roundNbr) + ".jpg"
            
            filePath = os.path.join(folderPath, fileName)
            cv2.imwrite(filePath, img)
            os.system("start http://localhost/table.html?file=" + folderName + "/" + fileName)

            roundNbr += 1
            time.sleep(10)
            print("Captured Round #" + str(roundNbr - 1))

if __name__ == "__main__":
    threadRecognize = Thread(target = recognize)
    threadScanInput = Thread(target = scanInput)
    threadRecognize.start()  
    threadScanInput.start()
    threadRecognize.join()  
    threadScanInput.join()