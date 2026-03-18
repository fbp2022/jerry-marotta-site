#!/bin/bash
# ══════════════════════════════════════════════════════════════
#  Jerry Marotta Website — Image Downloader
#  Run this once to download all 15 photos from Jerry's Wix site.
#
#  HOW TO RUN:
#    Mac/Linux:   bash download-images.sh
#    Windows:     Open Git Bash, then: bash download-images.sh
# ══════════════════════════════════════════════════════════════

mkdir -p images
echo "📥 Downloading all photos from Jerry's Wix site..."
echo ""

dl() {
  echo "[$1/15] $3"
  curl -sL "$2" -o "images/$3" && echo "       ✓ Saved" || echo "       ✗ Failed"
}

dl 1  "https://static.wixstatic.com/media/690d8a_e79ba79f12dc4075901f45613417ff04~mv2.jpg"                     "jerry-with-plane.jpg"
dl 2  "https://static.wixstatic.com/media/690d8a_f900e4f7ebad43f0b88847d5ab7ac16d~mv2.jpg"                     "flight-simulator.jpg"
dl 3  "https://static.wixstatic.com/media/690d8a_b9f493c738824fdfbf51f104ccedbd7b~mv2.jpg"                     "gallery-01.jpg"
dl 4  "https://static.wixstatic.com/media/690d8a_eb7cb5d560d440b6ae8565bdd6ce9cb7~mv2.jpg"                     "gallery-02.jpg"
dl 5  "https://static.wixstatic.com/media/690d8a_c9a857ebdbef4849a8797d5a6946c089~mv2.jpg"                     "gallery-03.jpg"
dl 6  "https://static.wixstatic.com/media/690d8a_d026e9de5166475cbb5f87acb43da61b~mv2.jpg"                     "gallery-04.jpg"
dl 7  "https://static.wixstatic.com/media/690d8a_0ec273c9ca9946dc951abf782d92d34f~mv2.jpg"                     "gallery-05.jpg"
dl 8  "https://static.wixstatic.com/media/690d8a_32fc0d51652d4dfda6d5ebd6440e29c1~mv2.jpg"                     "gallery-06.jpg"
dl 9  "https://static.wixstatic.com/media/690d8a_5ee196f316d04b5f88639f5497172a42~mv2.jpg"                     "gallery-07.jpg"
dl 10 "https://static.wixstatic.com/media/690d8a_bc2fd4d3ba9448739f8712cb284c5473~mv2.jpg"                     "gallery-08.jpg"
dl 11 "https://static.wixstatic.com/media/690d8a_5910eea0633e4ab5bf95a95d70a3bab3~mv2.jpg"                     "gallery-09.jpg"
dl 12 "https://static.wixstatic.com/media/690d8a_21723e82c74448adb7efb3d1f555c76f~mv2.jpg"                     "gallery-10.jpg"
dl 13 "https://static.wixstatic.com/media/690d8a_8d065c276310453789e5a60bb3b4ef3a~mv2.jpg"                     "gallery-11.jpg"
dl 14 "https://static.wixstatic.com/media/690d8a_39ae15a927914c18ac57c32ac4cb7319~mv2.jpg"                     "gallery-12.jpg"
dl 15 "https://static.wixstatic.com/media/690d8a_26da603d42b84d5e862bc31be8561fc2~mv2_d_1541_1203_s_2.jpeg"    "gallery-13.jpeg"

echo ""
echo "══════════════════════════════════════════"
echo "✅  Done! All images saved to ./images/"
echo ""
ls -lh images/
echo "══════════════════════════════════════════"
