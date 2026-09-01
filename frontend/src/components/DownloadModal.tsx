import React, { useState } from 'react';
import {
  X,
  Laptop,
  Apple,
  Smartphone,
  Download,
  ShieldCheck,
  CheckCircle2,
  Sparkles,
  Zap,
  HardDrive,
  ExternalLink,
} from 'lucide-react';
import { detectUserOS } from '../player/security/fingerprint';

interface DownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({ isOpen, onClose }) => {
  const detectedOS = detectUserOS();
  const [activeTab, setActiveTab] = useState<'windows' | 'mac' | 'mobile'>(
    detectedOS === 'mac' ? 'mac' : detectedOS === 'ios' || detectedOS === 'android' ? 'mobile' : 'windows'
  );
  const [downloadingFile, setDownloadingFile] = useState<string | null>(null);
  const [downloadedFile, setDownloadedFile] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDownload = (url: string, filename: string) => {
    if (!url || url === '#' || downloadingFile) return;

    setDownloadingFile(filename);

    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    setTimeout(() => {
      setDownloadingFile(null);
      setDownloadedFile(filename);
      setTimeout(() => {
        setDownloadedFile(null);
      }, 4000);
    }, 1200);
  };

  return (
    <div
      className="modal-backdrop-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 999999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        className="download-modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{
          maxWidth: '680px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#0b1329',
          border: '1px solid rgba(249, 115, 22, 0.35)',
          borderRadius: '18px',
          padding: '24px',
          boxShadow: '0 25px 60px -15px rgba(0, 0, 0, 0.9), 0 0 35px rgba(249, 115, 22, 0.2)',
          position: 'relative',
          animation: 'slideUp 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            paddingBottom: '16px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(249, 115, 22, 0.2), rgba(234, 88, 12, 0.35))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f97316',
                border: '1px solid rgba(249, 115, 22, 0.3)',
              }}
            >
              <Download size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: '19px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                Download EduOne Secure Player
              </h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
                Select the best edition for your operating system and workflow
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: '8px',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget.style.color = '#ffffff');
              (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)');
            }}
            onMouseLeave={(e) => {
              (e.currentTarget.style.color = '#94a3b8');
              (e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)');
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Platform Selector Tabs */}
        <div
          style={{
            display: 'flex',
            gap: '8px',
            background: 'rgba(255, 255, 255, 0.04)',
            padding: '5px',
            borderRadius: '12px',
            margin: '20px 0',
          }}
        >
          <button
            onClick={() => setActiveTab('windows')}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              transition: 'all 0.2s ease',
              background: activeTab === 'windows' ? 'linear-gradient(135deg, #ea580c, #f97316)' : 'transparent',
              color: activeTab === 'windows' ? '#ffffff' : '#94a3b8',
              boxShadow: activeTab === 'windows' ? '0 4px 12px rgba(234, 88, 12, 0.3)' : 'none',
            }}
          >
            <Laptop size={16} />
            <span>Windows</span>
            {detectedOS === 'windows' && (
              <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.25)', padding: '2px 6px', borderRadius: '10px' }}>
                Your OS
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('mac')}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              transition: 'all 0.2s ease',
              background: activeTab === 'mac' ? 'linear-gradient(135deg, #ea580c, #f97316)' : 'transparent',
              color: activeTab === 'mac' ? '#ffffff' : '#94a3b8',
              boxShadow: activeTab === 'mac' ? '0 4px 12px rgba(234, 88, 12, 0.3)' : 'none',
            }}
          >
            <Apple size={16} />
            <span>macOS</span>
            {detectedOS === 'mac' && (
              <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.25)', padding: '2px 6px', borderRadius: '10px' }}>
                Your OS
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('mobile')}
            style={{
              flex: 1,
              padding: '10px 14px',
              borderRadius: '9px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '7px',
              transition: 'all 0.2s ease',
              background: activeTab === 'mobile' ? 'linear-gradient(135deg, #ea580c, #f97316)' : 'transparent',
              color: activeTab === 'mobile' ? '#ffffff' : '#94a3b8',
              boxShadow: activeTab === 'mobile' ? '0 4px 12px rgba(234, 88, 12, 0.3)' : 'none',
            }}
          >
            <Smartphone size={16} />
            <span>Mobile</span>
            {(detectedOS === 'ios' || detectedOS === 'android') && (
              <span style={{ fontSize: '10px', background: 'rgba(255,255,255,0.25)', padding: '2px 6px', borderRadius: '10px' }}>
                Your OS
              </span>
            )}
          </button>
        </div>

        {/* Edition Options Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: activeTab === 'mobile' ? '1fr 1fr' : '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
          {activeTab === 'windows' && (
            <>
              {/* Windows Option 1: Installer */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(249, 115, 22, 0.35)',
                  borderRadius: '14px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
                }}
              >
                <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                  <span
                    style={{
                      background: 'rgba(249, 115, 22, 0.2)',
                      color: '#f97316',
                      border: '1px solid rgba(249, 115, 22, 0.4)',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Sparkles size={11} />
                    Recommended
                  </span>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Zap size={18} color="#f97316" />
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                      Setup Installer
                    </h3>
                  </div>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                    Standard installation package. Best for personal laptops and PCs.
                  </p>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px 0', fontSize: '12px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>1-Click Launch from Chrome / Edge</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>Desktop & Start Menu shortcuts</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>Automatic protocol integration</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>Full hardware screen blackout</span>
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => handleDownload('/EduOne-SecurePlayer-Setup.exe', 'EduOne-SecurePlayer-Setup.exe')}
                  className="primary-btn"
                  style={{
                    width: '100%',
                    padding: '11px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    borderRadius: '9px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    background:
                      downloadedFile === 'EduOne-SecurePlayer-Setup.exe'
                        ? '#059669'
                        : 'linear-gradient(135deg, #ea580c, #f97316)',
                    border: 'none',
                    color: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  {downloadingFile === 'EduOne-SecurePlayer-Setup.exe' ? (
                    <>
                      <div className="button-spinner" style={{ width: '13px', height: '13px', borderWidth: '2px', borderTopColor: '#ffffff' }} />
                      <span>Downloading (81.6 MB)...</span>
                    </>
                  ) : downloadedFile === 'EduOne-SecurePlayer-Setup.exe' ? (
                    <>
                      <ShieldCheck size={15} />
                      <span>Downloaded!</span>
                    </>
                  ) : (
                    <>
                      <Download size={15} />
                      <span>Download Installer (.exe)</span>
                    </>
                  )}
                </button>
              </div>

              {/* Windows Option 2: Portable */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '14px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                }}
              >
                <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                  <span
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#94a3b8',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    Zero-Install
                  </span>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <HardDrive size={18} color="#94a3b8" />
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                      Portable Edition
                    </h3>
                  </div>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                    Standalone executable. Great for lab / shared PCs without admin permissions.
                  </p>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px 0', fontSize: '12px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>No installation or admin rights required</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>Runs directly from USB or Downloads</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>Watch lectures directly inside player</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>Full hardware screen blackout</span>
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => handleDownload('/EduOne-SecurePlayer-Portable.exe', 'EduOne-SecurePlayer-Portable.exe')}
                  className="secondary-btn"
                  style={{
                    width: '100%',
                    padding: '11px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    borderRadius: '9px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    background:
                      downloadedFile === 'EduOne-SecurePlayer-Portable.exe'
                        ? 'rgba(16, 185, 129, 0.15)'
                        : 'rgba(255, 255, 255, 0.06)',
                    borderColor:
                      downloadedFile === 'EduOne-SecurePlayer-Portable.exe'
                        ? '#10b981'
                        : 'rgba(255, 255, 255, 0.15)',
                    color:
                      downloadedFile === 'EduOne-SecurePlayer-Portable.exe'
                        ? '#10b981'
                        : '#f8fafc',
                    cursor: 'pointer',
                  }}
                >
                  {downloadingFile === 'EduOne-SecurePlayer-Portable.exe' ? (
                    <>
                      <div className="button-spinner" style={{ width: '13px', height: '13px', borderWidth: '2px', borderTopColor: '#f8fafc' }} />
                      <span>Downloading (81.4 MB)...</span>
                    </>
                  ) : downloadedFile === 'EduOne-SecurePlayer-Portable.exe' ? (
                    <>
                      <ShieldCheck size={15} />
                      <span>Downloaded!</span>
                    </>
                  ) : (
                    <>
                      <Download size={15} />
                      <span>Download Portable (.exe)</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {activeTab === 'mac' && (
            <>
              {/* macOS Option 1: Apple Silicon DMG (M1/M2/M3/M4) */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(249, 115, 22, 0.35)',
                  borderRadius: '14px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
                }}
              >
                <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                  <span
                    style={{
                      background: 'rgba(249, 115, 22, 0.2)',
                      color: '#f97316',
                      border: '1px solid rgba(249, 115, 22, 0.4)',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Sparkles size={11} />
                    Apple Silicon
                  </span>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Apple size={18} color="#f97316" />
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                      Apple Silicon (M1 / M2 / M3 / M4)
                    </h3>
                  </div>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                    Native ARM64 build for modern Apple Silicon MacBooks, iMacs, Mac Studios & Mac Minis.
                  </p>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px 0', fontSize: '12px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>Optimized for M-Series Apple Silicon</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>Drag-and-Drop install to /Applications</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>1-Click Launch from Safari / Chrome (eduone://)</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>Hardware NSWindowSharingNone screen blackout</span>
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => handleDownload('/EduOne-SecurePlayer-AppleSilicon.dmg', 'EduOne-SecurePlayer-AppleSilicon.dmg')}
                  className="primary-btn"
                  style={{
                    width: '100%',
                    padding: '11px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    borderRadius: '9px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    background:
                      downloadedFile === 'EduOne-SecurePlayer-AppleSilicon.dmg'
                        ? '#059669'
                        : 'linear-gradient(135deg, #ea580c, #f97316)',
                    border: 'none',
                    color: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  {downloadingFile === 'EduOne-SecurePlayer-AppleSilicon.dmg' ? (
                    <>
                      <div className="button-spinner" style={{ width: '13px', height: '13px', borderWidth: '2px', borderTopColor: '#ffffff' }} />
                      <span>Downloading Apple Silicon...</span>
                    </>
                  ) : downloadedFile === 'EduOne-SecurePlayer-AppleSilicon.dmg' ? (
                    <>
                      <ShieldCheck size={15} />
                      <span>Downloaded!</span>
                    </>
                  ) : (
                    <>
                      <Download size={15} />
                      <span>Download Apple Silicon (.dmg)</span>
                    </>
                  )}
                </button>
              </div>

              {/* macOS Option 2: Intel Mac DMG */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '14px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  position: 'relative',
                }}
              >
                <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                  <span
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      color: '#94a3b8',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      padding: '3px 8px',
                      borderRadius: '6px',
                    }}
                  >
                    Intel x64
                  </span>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Laptop size={18} color="#94a3b8" />
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                      Intel Macs (Core i5 / i7 / i9)
                    </h3>
                  </div>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                    Native 64-bit DMG installer for Intel-powered Mac computers.
                  </p>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px 0', fontSize: '12px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>Optimized for Intel 64-bit architecture</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>Drag-and-Drop install to /Applications</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>1-Click Launch from Safari / Chrome (eduone://)</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>Hardware NSWindowSharingNone screen blackout</span>
                    </li>
                  </ul>
                </div>

                <button
                  onClick={() => handleDownload('/EduOne-SecurePlayer-Intel.dmg', 'EduOne-SecurePlayer-Intel.dmg')}
                  className="secondary-btn"
                  style={{
                    width: '100%',
                    padding: '11px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    borderRadius: '9px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    background:
                      downloadedFile === 'EduOne-SecurePlayer-Intel.dmg'
                        ? 'rgba(16, 185, 129, 0.15)'
                        : 'rgba(255, 255, 255, 0.06)',
                    borderColor:
                      downloadedFile === 'EduOne-SecurePlayer-Intel.dmg'
                        ? '#10b981'
                        : 'rgba(255, 255, 255, 0.15)',
                    color:
                      downloadedFile === 'EduOne-SecurePlayer-Intel.dmg'
                        ? '#10b981'
                        : '#f8fafc',
                    cursor: 'pointer',
                  }}
                >
                  {downloadingFile === 'EduOne-SecurePlayer-Intel.dmg' ? (
                    <>
                      <div className="button-spinner" style={{ width: '13px', height: '13px', borderWidth: '2px', borderTopColor: '#f8fafc' }} />
                      <span>Downloading Intel...</span>
                    </>
                  ) : downloadedFile === 'EduOne-SecurePlayer-Intel.dmg' ? (
                    <>
                      <ShieldCheck size={15} />
                      <span>Downloaded!</span>
                    </>
                  ) : (
                    <>
                      <Download size={15} />
                      <span>Download Intel (.dmg)</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}

          {activeTab === 'mobile' && (
            <>
              {/* iOS Card */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '14px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Smartphone size={18} color="#f97316" />
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                      iPhone & iPad (iOS)
                    </h3>
                  </div>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                    Official EduOne iOS app with Apple FairPlay DRM stream encryption.
                  </p>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px 0', fontSize: '12px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>iOS Screen Recording Blocker</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>AirPlay mirroring protection</span>
                    </li>
                  </ul>
                </div>

                <a
                  href="#app-store"
                  className="secondary-btn"
                  style={{
                    width: '100%',
                    padding: '11px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    borderRadius: '9px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    textDecoration: 'none',
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#f8fafc',
                    boxSizing: 'border-box',
                  }}
                >
                  <ExternalLink size={15} />
                  <span>Get on Apple App Store</span>
                </a>
              </div>

              {/* Android Card */}
              <div
                style={{
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '14px',
                  padding: '18px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                    <Smartphone size={18} color="#10b981" />
                    <h3 style={{ fontSize: '16px', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                      Android Devices
                    </h3>
                  </div>
                  <p style={{ fontSize: '12px', color: '#94a3b8', margin: '0 0 14px 0', lineHeight: 1.5 }}>
                    EduOne Android client featuring FLAG_SECURE hardware protection.
                  </p>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 18px 0', fontSize: '12px', color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>FLAG_SECURE Blackout Active</span>
                    </li>
                    <li style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <CheckCircle2 size={13} color="#10b981" />
                      <span>Android Screen Capture Blocked</span>
                    </li>
                  </ul>
                </div>

                <a
                  href="/EduOne-SecurePlayer.apk"
                  download="EduOne-SecurePlayer.apk"
                  className="secondary-btn"
                  style={{
                    width: '100%',
                    padding: '11px 16px',
                    fontSize: '13px',
                    fontWeight: 600,
                    borderRadius: '9px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '7px',
                    textDecoration: 'none',
                    background: 'rgba(255, 255, 255, 0.06)',
                    color: '#f8fafc',
                    boxSizing: 'border-box',
                  }}
                >
                  <Download size={15} />
                  <span>Download APK Package</span>
                </a>
              </div>
            </>
          )}
        </div>

        {/* Footer Security Note */}
        <div
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.08)',
            paddingTop: '14px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontSize: '12px',
            color: '#64748b',
            textAlign: 'center',
          }}
        >
          <ShieldCheck size={16} color="#059669" />
          <span>All editions include AES-128 cryptographic key delivery & native OS screen recording blackout.</span>
        </div>
      </div>
    </div>
  );
};
