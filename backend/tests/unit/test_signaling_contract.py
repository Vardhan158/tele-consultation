from teleconsult.modules.consultation.signaling import sio


def test_socketio_signaling_contract_is_registered():
    assert {"connect", "join_room", "offer", "answer", "ice_candidate", "admit_patient", "leave_room", "end_consultation"}.issubset(sio.handlers["/"].keys())


def test_media_is_not_recorded_by_signaling_server():
    # Signaling relays SDP/ICE only; no media or recording event is registered.
    assert "record" not in sio.handlers["/"]
