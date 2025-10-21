from flask import Flask, request, jsonify
from flask_cors import CORS
import cv2
import numpy as np
import face_recognition
import base64
import json
import os
from datetime import datetime
import uuid

app = Flask(__name__)
CORS(app)

# Storage directory for face encodings
DATA_DIR = 'face_data'
ENCODINGS_FILE = os.path.join(DATA_DIR, 'encodings.json')

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

# In-memory storage (also persisted to disk)
registered_faces = []

# Configuration
RECOGNITION_THRESHOLD = 0.4
SAMPLES_PER_REGISTRATION = 5

def load_encodings():
    """Load face encodings from disk"""
    global registered_faces
    if os.path.exists(ENCODINGS_FILE):
        try:
            with open(ENCODINGS_FILE, 'r') as f:
                data = json.load(f)
                registered_faces = data
                print(f"Loaded {len(registered_faces)} faces from storage")
        except Exception as e:
            print(f"Error loading encodings: {e}")
            registered_faces = []
    else:
        registered_faces = []

def save_encodings():
    """Save face encodings to disk"""
    try:
        with open(ENCODINGS_FILE, 'w') as f:
            json.dump(registered_faces, f)
        print("Encodings saved successfully")
    except Exception as e:
        print(f"Error saving encodings: {e}")

def decode_base64_image(base64_string):
    """Decode base64 string to numpy array (image)"""
    try:
        # Remove header if present
        if 'base64,' in base64_string:
            base64_string = base64_string.split('base64,')[1]
        
        img_data = base64.b64decode(base64_string)
        nparr = np.frombuffer(img_data, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        # Convert BGR to RGB (face_recognition expects RGB)
        img_rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        return img_rgb
    except Exception as e:
        print(f"Error decoding image: {e}")
        return None

def create_thumbnail(image, face_location):
    """Create thumbnail from face location"""
    try:
        top, right, bottom, left = face_location
        face_img = image[top:bottom, left:right]
        
        # Resize to 160x160
        face_img = cv2.resize(face_img, (160, 160))
        
        # Convert to base64
        _, buffer = cv2.imencode('.jpg', cv2.cvtColor(face_img, cv2.COLOR_RGB2BGR))
        thumbnail_base64 = base64.b64encode(buffer).decode('utf-8')
        
        return thumbnail_base64
    except Exception as e:
        print(f"Error creating thumbnail: {e}")
        return None

@app.route('/', methods=['GET'])
def index():
    """Root endpoint"""
    return "Facial Recognition API is running on /api endpoints"

@app.route('/api/model-status', methods=['GET'])
def model_status():
    """Check if models are loaded (face_recognition library handles this internally)"""
    return jsonify({
        'loaded': True,
        'message': 'face_recognition models loaded'
    })

@app.route('/api/register', methods=['POST'])
def register_face():
    """Register a new face"""
    try:
        data = request.json
        name = data.get('name')
        images = data.get('images', [])
        
        if not name or not images:
            return jsonify({'success': False, 'error': 'Name and images required'}), 400
        
        all_encodings = []
        thumbnail = None
        
        # Process each image sample
        for img_base64 in images[:SAMPLES_PER_REGISTRATION]:
            img = decode_base64_image(img_base64)
            
            if img is None:
                continue
            
            # Detect faces
            face_locations = face_recognition.face_locations(img)
            
            if len(face_locations) == 0:
                continue
            
            # Get face encoding
            face_encodings = face_recognition.face_encodings(img, face_locations)
            
            if len(face_encodings) > 0:
                all_encodings.append(face_encodings[0].tolist())
                
                # Create thumbnail from first successful detection
                if thumbnail is None:
                    thumbnail = create_thumbnail(img, face_locations[0])
        
        if len(all_encodings) == 0:
            return jsonify({'success': False, 'error': 'No faces detected in images'}), 400
        
        # Calculate averaged encoding
        averaged_encoding = np.mean(all_encodings, axis=0).tolist()
        
        # Create face record
        face_record = {
            'id': str(uuid.uuid4()),
            'name': name,
            'encoding': averaged_encoding,
            'all_encodings': all_encodings,
            'thumbnail': thumbnail,
            'timestamp': datetime.now().isoformat()
        }
        
        registered_faces.append(face_record)
        save_encodings()
        
        return jsonify({
            'success': True,
            'message': f'Registered {name} with {len(all_encodings)} samples',
            'face_id': face_record['id']
        })
        
    except Exception as e:
        print(f"Registration error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/recognize', methods=['POST'])
def recognize_face():
    """Recognize faces in an image"""
    try:
        data = request.json
        img_base64 = data.get('image')
        
        if not img_base64:
            return jsonify({'success': False, 'error': 'Image required'}), 400
        
        img = decode_base64_image(img_base64)
        
        if img is None:
            return jsonify({'success': False, 'error': 'Invalid image'}), 400
        
        # Detect faces
        face_locations = face_recognition.face_locations(img)
        face_encodings = face_recognition.face_encodings(img, face_locations)
        
        recognized_faces = []
        
        # Match each detected face
        for face_encoding, face_location in zip(face_encodings, face_locations):
            name = "Unknown"
            confidence = 0.0

            if len(registered_faces) > 0:
                best_distance = float('inf')
                best_name = None

                # Check against all registered faces
                for face in registered_faces:
                    # Get all encodings for this face
                    all_encs = [np.array(enc) for enc in face['all_encodings']]
                    if all_encs:
                        # Calculate distances to all samples
                        distances = face_recognition.face_distance(all_encs, face_encoding)
                        min_dist = np.min(distances)
                        if min_dist < best_distance:
                            best_distance = min_dist
                            best_name = face['name']

                # Check if best match is within threshold
                if best_distance <= RECOGNITION_THRESHOLD:
                    name = best_name
                    confidence = 1.0 - best_distance
            
            recognized_faces.append({
                'name': name,
                'confidence': float(confidence),
                'location': {
                    'top': int(face_location[0]),
                    'right': int(face_location[1]),
                    'bottom': int(face_location[2]),
                    'left': int(face_location[3])
                }
            })
        
        return jsonify({
            'success': True,
            'faces': recognized_faces,
            'count': len(recognized_faces)
        })
        
    except Exception as e:
        print(f"Recognition error: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/faces', methods=['GET'])
def get_faces():
    """Get all registered faces"""
    try:
        # Return faces without encodings (too large for transfer)
        faces_response = []
        for face in registered_faces:
            faces_response.append({
                'id': face['id'],
                'name': face['name'],
                'thumbnail': face['thumbnail'],
                'timestamp': face['timestamp']
            })
        
        return jsonify({
            'success': True,
            'faces': faces_response,
            'count': len(faces_response)
        })
    except Exception as e:
        print(f"Error getting faces: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/faces/<face_id>', methods=['DELETE'])
def delete_face(face_id):
    """Delete a registered face"""
    try:
        global registered_faces
        
        # Find and remove face
        registered_faces = [f for f in registered_faces if f['id'] != face_id]
        save_encodings()
        
        return jsonify({
            'success': True,
            'message': 'Face deleted successfully'
        })
    except Exception as e:
        print(f"Error deleting face: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/faces', methods=['DELETE'])
def clear_all_faces():
    """Clear all registered faces"""
    try:
        global registered_faces
        registered_faces = []
        save_encodings()
        
        return jsonify({
            'success': True,
            'message': 'All faces cleared'
        })
    except Exception as e:
        print(f"Error clearing faces: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'registered_faces': len(registered_faces)
    })

if __name__ == '__main__':
    print("Loading face encodings...")
    load_encodings()
    print(f"Server starting with {len(registered_faces)} registered faces")
    print("Server running on http://localhost:5000")
    app.run(debug=True, host='0.0.0.0', port=5000)