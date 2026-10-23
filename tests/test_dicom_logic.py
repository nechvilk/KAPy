# tests/test_dicom_logic.py
from pathlib import Path
import numpy as np
import pydicom
from pydicom.dataset import FileDataset, FileMetaDataset
import pytest

from dicom_logic import generate_thumb, get_drl_metadata


def _vytvor_testovaci_dicom(
    cesta_k_souboru,
    patient_id="12345",
    sex="M",
    datum="20260812",
    kap_hodnota="0.05",
    obsahuje_obrazek=False,
):
    """Pomocná funkce pro vygenerování platného testovacího DICOM souboru."""
    # 1. Povinná DICOM hlavička (File Meta Information)
    file_meta = FileMetaDataset()
    file_meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.1"
    file_meta.MediaStorageSOPInstanceUID = "1.2.3.4.5"
    file_meta.TransferSyntaxUID = pydicom.uid.ExplicitVRLittleEndian

    # 2. Samotný Dataset
    ds = FileDataset(
        str(cesta_k_souboru), {}, file_meta=file_meta, preamble=b"\0" * 128
    )
    ds.PatientID = patient_id
    ds.PatientSex = sex
    ds.StudyDate = datum
    ds.StudyDescription = "Rtg hrudniku"
    ds.Manufacturer = "Siemens"
    ds.PatientWeight = "75"

    # Tag (0x0018, 0x115E) = Image Area Dose Product (KAP)
    if kap_hodnota is not None:
        ds.add_new((0x0018, 0x115E), "DS", str(kap_hodnota))

    # Pokud testujeme náhled, přidáme i pole pixelů (obrázek 50x50px)
    if obsahuje_obrazek:
        pixel_array = np.ones((50, 50), dtype=np.uint16) * 1000
        ds.Rows = 50
        ds.Columns = 50
        ds.BitsAllocated = 16
        ds.BitsStored = 12
        ds.HighBit = 11
        ds.PixelRepresentation = 0
        ds.SamplesPerPixel = 1
        ds.PhotometricInterpretation = "MONOCHROME2"
        ds.PixelData = pixel_array.tobytes()

    ds.save_as(str(cesta_k_souboru))
    return cesta_k_souboru


# =====================================================================
# TESTY PRO get_drl_metadata
# =====================================================================


def test_get_drl_metadata_platny_soubor(tmp_path):
    """Ověří správný převod dat: sex M->Muž, datum YYYYMMDD->DD.MM.YYYY a přepočet KAP (*100)."""
    dicom_path = tmp_path / "test.dcm"
    _vytvor_testovaci_dicom(
        dicom_path, sex="M", datum="20260812", kap_hodnota="0.05"
    )

    data = get_drl_metadata(dicom_path)

    assert data["PatientID"] == "12345"
    assert data["PatientSex"] == "Muž"  # Ověření mapování M -> Muž
    assert data["StudyDate"] == "12.08.2026"  # Ověření formátování data
    assert data["KAP"] == 5.0  # 0.05 * 100.0 = 5.0
    assert data["Manufacturer"] == "Siemens"


def test_get_drl_metadata_chybejici_kap_a_datum(tmp_path):
    """Ověří, že si funkce poradí s chybějícími tagy a nespadne na KeyError."""
    dicom_path = tmp_path / "nekompletni.dcm"
    _vytvor_testovaci_dicom(
        dicom_path, datum="2026", kap_hodnota=None  # Neplatná délka data
    )

    data = get_drl_metadata(dicom_path)

    assert data["KAP"] == "N/A"
    assert data["StudyDate"] == "---"


def test_get_drl_metadata_neexistujici_soubor(tmp_path):
    """Ověří odchycení výjimky, pokud soubor neexistuje."""
    fake_path = tmp_path / "neexistuje.dcm"

    data = get_drl_metadata(fake_path)

    assert "error" in data
    assert data["filename"] == "neexistuje.dcm"


# =====================================================================
# TESTY PRO generate_thumb
# =====================================================================


def test_generate_thumb_uspesne_vytvoreni(tmp_path):
    """Ověří, že se fyzicky vytvoří obrázek náhledu na disku."""
    dicom_path = tmp_path / "obrazek.dcm"
    _vytvor_testovaci_dicom(dicom_path, obsahuje_obrazek=True)

    thumb_folder = tmp_path / "thumbs"
    thumb_name = "nahled.png"

    vysledek = generate_thumb(dicom_path, thumb_folder, thumb_name)

    assert vysledek == "nahled.png"
    # Fyzická kontrola, že soubor ve složce opravdu vznikl
    assert (thumb_folder / "nahled.png").exists()


def test_generate_thumb_bez_pixel_dat(tmp_path):
    """Ověří, že pokus o vytvoření náhledu ze souboru bez pixelů vrátí None."""
    dicom_path = tmp_path / "bez_obrazku.dcm"
    _vytvor_testovaci_dicom(dicom_path, obsahuje_obrazek=False)

    vysledek = generate_thumb(
        dicom_path, tmp_path / "thumbs", "nahled_chyba.png"
    )

    assert vysledek is None