const API_BASE = 'http://localhost:5000/api';
let capturedImages = [];
let currentImage = null;

// Utility function to convert file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Utility function to capture image from video
function captureImage(video) {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, 320, 240);
    return canvas.toDataURL('image/jpeg');
}



// Load registered faces
async function loadFaces() {
    try {
        const response = await fetch(`${API_BASE}/faces`);
        const result = await response.json();
        const container = document.getElementById('facesContainer');

        if (result.success) {
            let html = '';
            result.faces.forEach(face => {
                html += `
                    <div class="col-md-4 face-card">
                        <div class="card">
                            <img src="data:image/jpeg;base64,${face.thumbnail}" class="card-img-top face-thumbnail" alt="${face.name}">
                            <div class="card-body">
                                <h5 class="card-title">${face.name}</h5>
                                <p class="card-text">Registered: ${new Date(face.timestamp).toLocaleString()}</p>
                                <button class="btn btn-danger btn-sm" onclick="deleteFace('${face.id}')">Delete</button>
                            </div>
                        </div>
                    </div>
                `;
            });
            container.innerHTML = html;
        } else {
            container.innerHTML = '<div class="alert alert-danger">Error loading faces.</div>';
        }
    } catch (error) {
        document.getElementById('facesContainer').innerHTML = '<div class="alert alert-danger">Error loading faces.</div>';
        console.error(error);
    }
}

// Delete face
async function deleteFace(faceId) {
    if (!confirm('Are you sure you want to delete this face?')) return;

    try {
        const response = await fetch(`${API_BASE}/faces/${faceId}`, { method: 'DELETE' });
        const result = await response.json();
        if (result.success) {
            loadFaces();
        } else {
            alert('Error deleting face: ' + result.error);
        }
    } catch (error) {
        alert('Error deleting face.');
        console.error(error);
    }
}

// Health check
document.getElementById('healthCheck').addEventListener('click', async () => {
    try {
        const response = await fetch(`${API_BASE}/health`);
        const result = await response.json();
        document.getElementById('healthStatus').innerHTML = `
            <div class="alert alert-info">
                Status: ${result.status}<br>
                Registered Faces: ${result.registered_faces}
            </div>
        `;
    } catch (error) {
        document.getElementById('healthStatus').innerHTML = '<div class="alert alert-danger">Unable to check health.</div>';
        console.error(error);
    }
});

// Refresh faces button
document.getElementById('refreshFaces').addEventListener('click', loadFaces);

// Load faces on page load
document.addEventListener('DOMContentLoaded', loadFaces);

// Show submit button when file is selected for recognition
document.getElementById('recognizeImageInput').addEventListener('change', () => {
    if (document.getElementById('recognizeImageInput').files.length > 0) {
        document.getElementById('recognizeBtn').style.display = 'inline-block';
    } else {
        document.getElementById('recognizeBtn').style.display = 'none';
    }
});

// Webcam for register
let streamRegister = null;
document.getElementById('useWebcamRegister').addEventListener('click', async () => {
    try {
        streamRegister = await navigator.mediaDevices.getUserMedia({ video: true });
        document.getElementById('videoRegister').srcObject = streamRegister;
        document.getElementById('webcamRegister').style.display = 'block';
        capturedImages = [];
        document.getElementById('capturedImages').innerHTML = '';
    } catch (error) {
        alert('Error accessing webcam.');
        console.error(error);
    }
});

document.getElementById('captureRegister').addEventListener('click', () => {
    const video = document.getElementById('videoRegister');
    const image = captureImage(video);
    capturedImages.push(image);
    const img = document.createElement('img');
    img.src = image;
    img.className = 'img-thumbnail me-2';
    img.style.width = '80px';
    document.getElementById('capturedImages').appendChild(img);
});

document.getElementById('stopWebcamRegister').addEventListener('click', () => {
    if (streamRegister) {
        streamRegister.getTracks().forEach(track => track.stop());
        document.getElementById('webcamRegister').style.display = 'none';
    }
});

// Modify register form to use captured images if webcam used
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('nameInput').value;
    const messageDiv = document.getElementById('registerMessage');

    let images = [];
    if (capturedImages.length > 0) {
        images = capturedImages;
    } else {
        const files = document.getElementById('imagesInput').files;
        if (files.length === 0) {
            messageDiv.innerHTML = '<div class="alert alert-danger">Please select at least one image or capture from webcam.</div>';
            return;
        }
        for (let file of files) {
            const base64 = await fileToBase64(file);
            images.push(base64);
        }
    }

    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, images })
        });

        const result = await response.json();
        if (result.success) {
            messageDiv.innerHTML = `<div class="alert alert-success">${result.message}</div>`;
            document.getElementById('registerForm').reset();
            capturedImages = [];
            document.getElementById('capturedImages').innerHTML = '';
            if (streamRegister) {
                streamRegister.getTracks().forEach(track => track.stop());
                document.getElementById('webcamRegister').style.display = 'none';
            }
            loadFaces();
        } else {
            messageDiv.innerHTML = `<div class="alert alert-danger">${result.error}</div>`;
        }
    } catch (error) {
        messageDiv.innerHTML = '<div class="alert alert-danger">Error registering face.</div>';
        console.error(error);
    }
});

// Webcam for recognize
let streamRecognize = null;
let liveInterval = null;
document.getElementById('useWebcamRecognize').addEventListener('click', async () => {
    try {
        streamRecognize = await navigator.mediaDevices.getUserMedia({ video: true });
        document.getElementById('videoRecognize').srcObject = streamRecognize;
        document.getElementById('webcamRecognize').style.display = 'block';
    } catch (error) {
        alert('Error accessing webcam.');
        console.error(error);
    }
});

document.getElementById('captureRecognize').addEventListener('click', async () => {
    const video = document.getElementById('videoRecognize');
    currentImage = captureImage(video);
    // Now recognize
    await recognizeImage(currentImage);
    if (streamRecognize) {
        streamRecognize.getTracks().forEach(track => track.stop());
        document.getElementById('webcamRecognize').style.display = 'none';
    }
});

document.getElementById('liveRecognize').addEventListener('click', () => {
    if (liveInterval) {
        clearInterval(liveInterval);
        liveInterval = null;
        document.getElementById('liveRecognize').textContent = 'Start Live Recognition';
    } else {
        liveInterval = setInterval(async () => {
            const video = document.getElementById('videoRecognize');
            const base64 = captureImage(video);
            await liveRecognize(base64);
        }, 2000); // every 2 seconds
        document.getElementById('liveRecognize').textContent = 'Stop Live Recognition';
    }
});

document.getElementById('stopWebcamRecognize').addEventListener('click', () => {
    if (liveInterval) {
        clearInterval(liveInterval);
        liveInterval = null;
        document.getElementById('liveRecognize').textContent = 'Start Live Recognition';
    }
    if (streamRecognize) {
        streamRecognize.getTracks().forEach(track => track.stop());
        document.getElementById('webcamRecognize').style.display = 'none';
    }
});

// Modify recognize form
document.getElementById('recognizeForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const file = document.getElementById('recognizeImageInput').files[0];
    const resultsDiv = document.getElementById('recognizeResults');

    let base64;
    if (currentImage) {
        base64 = currentImage;
        currentImage = null;
    } else if (file) {
        base64 = await fileToBase64(file);
    } else {
        resultsDiv.innerHTML = '<div class="alert alert-danger">Please select an image or capture from webcam.</div>';
        return;
    }

    await recognizeImage(base64);
});

// Separate recognize function
async function recognizeImage(base64) {
    const resultsDiv = document.getElementById('recognizeResults');

    try {
        // Display original image
        document.getElementById('originalImage').innerHTML = `<img src="${base64}" alt="Image" class="img-fluid">`;

        const response = await fetch(`${API_BASE}/recognize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64 })
        });

        const result = await response.json();
        if (result.success) {
            let facesHtml = '<h4>Recognized Faces:</h4>';
            if (result.faces.length === 0) {
                facesHtml += '<p>No faces detected.</p>';
            } else {
                result.faces.forEach(face => {
                    facesHtml += `
                        <div class="recognized-face">
                            <strong>${face.name}</strong> (Confidence: ${(face.confidence * 100).toFixed(2)}%)<br>
                            Location: Top: ${face.location.top}, Right: ${face.location.right}, Bottom: ${face.location.bottom}, Left: ${face.location.left}
                        </div>
                    `;
                });
            }
            document.getElementById('facesList').innerHTML = facesHtml;
        } else {
            document.getElementById('facesList').innerHTML = `<div class="alert alert-danger">${result.error}</div>`;
        }
    } catch (error) {
        resultsDiv.innerHTML = '<div class="alert alert-danger">Error recognizing faces.</div>';
        console.error(error);
    }
}

// Live recognize function for drawing on canvas
async function liveRecognize(base64) {
    try {
        const response = await fetch(`${API_BASE}/recognize`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: base64 })
        });

        const result = await response.json();
        const canvas = document.getElementById('canvasRecognize');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (result.success && result.faces.length > 0) {
            result.faces.forEach(face => {
                const { top, right, bottom, left } = face.location;
                // Mirror coords for flipped video
                const left_m = 320 - right;
                const right_m = 320 - left;
                ctx.strokeStyle = 'red';
                ctx.lineWidth = 2;
                ctx.strokeRect(left_m, top, right_m - left_m, bottom - top);
                ctx.fillStyle = 'red';
                ctx.font = '16px Arial';
                ctx.fillText(face.name, left_m, top - 5);
            });
        }
    } catch (error) {
        console.error('Error in live recognition:', error);
    }
}
