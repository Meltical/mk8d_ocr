import argparse
import time
import cv2
import os
import sys
from datetime import datetime

# Template
x = cv2.imread("./samples/x.jpg")

# Variables
roundNbr = 1
maxRoundNbr = 12

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

success, img = video.read()
if(not success):
    print("Wrong capture card selected (" + card + "). Try another index.")
    sys.exit()

video.set(3, 1280)
video.set(4, 720)

# Start Web Server
os.system("start run_local_server.bat")

print("Capturing " + str(maxRoundNbr) + " Rounds In Folder: " + folderPath + "...")

# Main loop
while True:
    if (cv2.waitKey(1) & 0xFF == ord('q')) or roundNbr == maxRoundNbr + 1:
        break
        
    # Get one frame, resize and crop
    success, img = video.read()
    if args.debug:
        cv2.imshow("Result", img)
    cv2.resize(img, (1280, 720))

    cropped = img[38:38+32, 44:44+32]
    result = cv2.matchTemplate(cropped, x, cv2.TM_CCOEFF_NORMED)
    (minVal, maxVal, minLoc, maxLoc) = cv2.minMaxLoc(result)

    # If matching template over 70%
    if(maxVal > 0.7):
        # Wait 3 seconds (animations, adding points...)
        time.sleep(3)

        # Get leaderboard and save it
        success, img = video.read()
        cv2.resize(img, (1280, 720))
        fileName = "Round_" + str(roundNbr) + ".jpg"
        
        filePath = os.path.join(folderPath, fileName)
        cv2.imwrite(filePath, img)
        os.system("start http://localhost/table.html?file=" + folderName + "/" + fileName)


        roundNbr += 1
        time.sleep(10)
        print("Captured Round #" + str(roundNbr - 1))
        

print("Capturing Ended.")
