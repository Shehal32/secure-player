import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  Upload,
  Fingerprint,
  Layers,
  Trash2,
  Search,
  CheckCircle2,
  Users,
  Globe,
  RefreshCw,
} from 'lucide-react';
import { CurrentUser } from './Navbar';

export interface LogItem {
  id: string;
  time: string;
  type: 'info' | 'security' | 'network' | 'success' | 'error';
  message: string;
  details?: string;
}

export interface WatermarkSessionLog {
  id: number;
  userId: string;
  videoId: string;
  sessionId: string;
  pattern: string;
  segmentCount: number;
  issuedAt: string;
}

export interface AnomalyItem {
  id: number;
  userId: string;
  sessionId: string;
  currentIp: string;
  prevIp: string;
  currentGeo: string;
  prevGeo: string;
  distanceKm: number;
  timeDeltaHours: number;
  implausibleSpeedKmh: number;
  actionTaken: string;
  createdAt: string;
}

export interface LeakDetectionResult {
  matchFound: boolean;
  userId?: string;
  studentName?: string;
  studentEmail?: string;
  studentId?: string;
  role?: string;
  accountCreated?: string;
  deviceIp?: string;
  deviceLocation?: string;
  userAgent?: string;
  deviceFingerprint?: string;
  sessionId?: string;
  videoId?: string;
  hammingDistance?: number;
  comparedBits?: number;
  errorRate?: number;
  confidence?: number;
  issuedAt?: string;
  extractedPattern?: string;
  message?: string;
}

export function formatUserAgent(ua?: string): string {
  if (!ua || ua === 'N/A' || ua === 'Unknown' || ua === 'Unknown Browser / OS') return 'Chrome • Windows 10/11 (PC)';

  // 1. Apple iPhone / iPad
  if (ua.includes('iPhone')) {
    const iosMatch = ua.match(/OS (\d+)_/);
    const iosVer = iosMatch ? ` (iOS ${iosMatch[1]})` : '';
    return `Apple iPhone${iosVer}`;
  }
  if (ua.includes('iPad')) {
    return 'Apple iPad';
  }

  // 2. Android Phone Model Extraction (e.g. Samsung SM-S918B, Xiaomi Redmi, Pixel)
  if (ua.includes('Android')) {
    const modelMatch = ua.match(/Android\s+[\d.]+;\s*([^;)]+)\)/i);
    let modelName = modelMatch ? modelMatch[1].trim() : '';

    // Clean and prefix known vendors
    if (modelName.startsWith('SM-') || modelName.startsWith('GT-')) {
      modelName = `Samsung ${modelName}`;
    } else if (modelName.toLowerCase().startsWith('pixel')) {
      modelName = `Google ${modelName}`;
    } else if (modelName.toLowerCase().includes('redmi') || modelName.toLowerCase().includes('mi ') || modelName.toLowerCase().includes('poco')) {
      modelName = `Xiaomi ${modelName}`;
    } else if (modelName.toLowerCase().includes('cph') || modelName.toLowerCase().includes('oppo')) {
      modelName = `OPPO ${modelName}`;
    } else if (modelName.toLowerCase().includes('v2') || modelName.toLowerCase().includes('vivo')) {
      modelName = `Vivo ${modelName}`;
    } else if (modelName.toLowerCase().includes('oneplus') || modelName.toLowerCase().includes('in20')) {
      modelName = `OnePlus ${modelName}`;
    }

    if (modelName && !modelName.toLowerCase().includes('build')) {
      return `${modelName} • Android`;
    }
    return 'Android Mobile Device';
  }

  // 3. Desktop OS
  let os = 'Windows 10/11 (PC)';
  if (ua.includes('Windows NT 10.0') || ua.includes('Windows NT 11.0')) os = 'Windows 10/11 (PC)';
  else if (ua.includes('Windows')) os = 'Windows (PC)';
  else if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS (MacBook/iMac)';
  else if (ua.includes('Linux')) os = 'Linux (PC)';

  let browser = 'Chrome';
  if (ua.includes('Edg/')) browser = 'Edge';
  else if (ua.includes('Chrome/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome')) browser = 'Safari';

  return `${browser} • ${os}`;
}

interface AdminPortalProps {
  currentUser: CurrentUser;
  apiBaseUrl: string;
  logs: LogItem[];
  onClearLogs: () => void;
  onLogEvent: (msg: string, type: LogItem['type'], details?: string) => void;
}

export const AdminPortal: React.FC<AdminPortalProps> = ({
  currentUser,
  apiBaseUrl,
  logs,
  onClearLogs,
  onLogEvent,
}) => {
  const [adminTab, setAdminTab] = useState<'forensics' | 'upload' | 'audit' | 'anomalies'>('forensics');

  // Video Upload Studio States
  const [uploadVideoId, setUploadVideoId] = useState('lecture_' + Math.floor(Math.random() * 899999 + 100000));
  const [uploadTitle, setUploadTitle] = useState('');
  const [uploadKeyRotation, setUploadKeyRotation] = useState('0');
  const [uploadSegmentDuration, setUploadSegmentDuration] = useState('6');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);
  const uploadFileInputRef = useRef<HTMLInputElement | null>(null);

  // Forensic Analysis States
  const [forensicVideoId, setForensicVideoId] = useState('demo_vid_001');
  const [forensicFile, setForensicFile] = useState<File | null>(null);
  const [extractedPattern, setExtractedPattern] = useState('');
  const [maxErrorRate, setMaxErrorRate] = useState('0.20');
  const [isSearchingLeak, setIsSearchingLeak] = useState(false);
  const [leakResult, setLeakResult] = useState<LeakDetectionResult | null>(null);
  const forensicFileInputRef = useRef<HTMLInputElement | null>(null);

  // Audit Logs Table State
  const [auditLogs, setAuditLogs] = useState<WatermarkSessionLog[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  // Anomalies Table State
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [isLoadingAnomalies, setIsLoadingAnomalies] = useState(false);

  // Uploaded Videos Inventory State
  const [videosList, setVideosList] = useState<Array<{ id: string; title: string; blobPrefix: string; keyCount: number; createdAt: string }>>([]);
  const [isLoadingVideos, setIsLoadingVideos] = useState(false);
  const [deletingVideoId, setDeletingVideoId] = useState<string | null>(null);

  // Inspector filter
  const [logFilter, setLogFilter] = useState<'all' | 'security' | 'network' | 'error'>('all');

  const filteredLogs = logs.filter((l) => {
    if (logFilter === 'all') return true;
    if (logFilter === 'security') return l.type === 'security';
    if (logFilter === 'network') return l.type === 'network';
    if (logFilter === 'error') return l.type === 'error';
    return true;
  });

  // Fetch videos inventory from backend
  const fetchVideosList = async () => {
    setIsLoadingVideos(true);
    try {
      const res = await fetch(`${apiBaseUrl}/upload/videos`);
      if (res.ok) {
        const data = await res.json();
        setVideosList(data.videos || []);
      }
    } catch {
      // Ignore
    } finally {
      setIsLoadingVideos(false);
    }
  };

  // Permanently delete video
  const handleDeleteVideo = async (videoId: string, title: string) => {
    if (
      !window.confirm(
        `Are you sure you want to permanently delete "${title}" (${videoId})?\n\nThis will remove the video record, its AES-128 encryption keys, student entitlements, and all Azure Blob Storage HLS segment files.`,
      )
    ) {
      return;
    }

    setDeletingVideoId(videoId);
    try {
      const res = await fetch(`${apiBaseUrl}/upload/videos/${encodeURIComponent(videoId)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Failed to delete video');
      }
      onLogEvent(`Video "${videoId}" (${title}) permanently deleted from storage and database.`, 'security');
      await fetchVideosList();
    } catch (err: any) {
      onLogEvent(`Video deletion failed: ${err.message}`, 'error');
    } finally {
      setDeletingVideoId(null);
    }
  };

  // Fetch audit sessions from backend
  const fetchAuditLogs = async () => {
    setIsLoadingAudit(true);
    try {
      const res = await fetch(`${apiBaseUrl}/watermark/logs`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data.logs || []);
      }
    } catch {
      // Ignore
    } finally {
      setIsLoadingAudit(false);
    }
  };

  // Fetch anomalies from backend
  const fetchAnomalies = async () => {
    setIsLoadingAnomalies(true);
    try {
      const res = await fetch(`${apiBaseUrl}/account/anomalies`);
      if (res.ok) {
        const data = await res.json();
        setAnomalies(data.anomalies || []);
      }
    } catch {
      // Ignore
    } finally {
      setIsLoadingAnomalies(false);
    }
  };

  useEffect(() => {
    if (adminTab === 'upload' || adminTab === 'forensics') {
      fetchVideosList();
    } else if (adminTab === 'audit') {
      fetchAuditLogs();
    } else if (adminTab === 'anomalies') {
      fetchAnomalies();
    }
  }, [adminTab, apiBaseUrl]);

  // Handle Video Upload & Packaging
  const handleUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile) return;

    try {
      setIsUploading(true);
      setUploadProgress('Packaging HLS A/B Dual Variants & Encrypting AES-128...');
      onLogEvent(`Starting AES-128 HLS upload for videoId="${uploadVideoId}"...`, 'security');

      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('videoId', uploadVideoId);
      formData.append('title', uploadTitle || `Lecture ${uploadVideoId}`);
      formData.append('userId', currentUser.userId);
      formData.append('keyRotation', uploadKeyRotation);
      formData.append('segmentDuration', uploadSegmentDuration);

      const res = await fetch(`${apiBaseUrl}/upload/video`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText || 'Encoding pipeline error');
      }

      const data = await res.json();
      setUploadProgress(null);
      onLogEvent(
        `Video "${uploadVideoId}" encoded & uploaded successfully!`,
        'success',
        `Segments=${data.segmentCount}, Azure=${data.uploadedToAzure ? 'YES' : 'NO'}`,
      );

      // Reset form
      setUploadFile(null);
      setUploadTitle('');
      setUploadVideoId('lecture_' + Math.floor(Math.random() * 899999 + 100000));
    } catch (err: any) {
      setUploadProgress(null);
      onLogEvent(`Upload failed: ${err.message}`, 'error');
    } finally {
      setIsUploading(false);
    }
  };

  // Handle Forensic Video / Screenshot Leak Analysis
  const handleAnalyzeFile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forensicFile) return;

    try {
      setIsSearchingLeak(true);
      setLeakResult(null);
      onLogEvent(`Uploading & scanning "${forensicFile.name}" for forensic markers...`, 'security');

      const formData = new FormData();
      formData.append('file', forensicFile);
      formData.append('videoId', forensicVideoId);
      formData.append('maxErrorRate', maxErrorRate);

      const res = await fetch(`${apiBaseUrl}/watermark/analyze-video`, {
        method: 'POST',
        body: formData,
      });

      const data: LeakDetectionResult = await res.json();
      setLeakResult(data);

      if (data.matchFound) {
        onLogEvent(
          `🚨 LEAKER IDENTIFIED: User="${data.userId}", Session="${data.sessionId}"`,
          'security',
          `Pattern: ${data.extractedPattern} • Hamming: ${data.hammingDistance}/${data.comparedBits} (Error: ${((data.errorRate || 0) * 100).toFixed(1)}%, Conf: ${((data.confidence || 0) * 100).toFixed(0)}%)`,
        );
      } else {
        onLogEvent(
          `Forensic scan completed: No registered session matched pattern "${data.extractedPattern || 'N/A'}"`,
          'info',
        );
      }
    } catch (err: any) {
      onLogEvent(`Forensic scan failed: ${err.message}`, 'error');
    } finally {
      setIsSearchingLeak(false);
    }
  };

  // Handle Manual Binary Pattern Leak Tracing
  const handleTracePattern = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extractedPattern.trim()) return;

    try {
      setIsSearchingLeak(true);
      setLeakResult(null);
      onLogEvent(`Tracing binary pattern "${extractedPattern}" against database...`, 'security');

      const res = await fetch(`${apiBaseUrl}/watermark/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoId: forensicVideoId,
          pattern: extractedPattern.trim(),
          maxErrorRate: parseFloat(maxErrorRate),
        }),
      });

      const data: LeakDetectionResult = await res.json();
      setLeakResult(data);

      if (data.matchFound) {
        onLogEvent(
          `🚨 MATCH FOUND: User="${data.userId}", Session="${data.sessionId}"`,
          'security',
          `Hamming: ${data.hammingDistance}/${data.comparedBits} (Confidence: ${((data.confidence || 0) * 100).toFixed(0)}%)`,
        );
      } else {
        onLogEvent('No session matched pattern string.', 'info');
      }
    } catch (err: any) {
      onLogEvent(`Pattern trace error: ${err.message}`, 'error');
    } finally {
      setIsSearchingLeak(false);
    }
  };

  return (
    <div className="admin-portal-container">
      {/* Admin Sub Navigation */}
      <div className="admin-nav-bar">
        <div className="nav-tabs">
          <button
            className={`tab-btn ${adminTab === 'forensics' ? 'active' : ''}`}
            onClick={() => setAdminTab('forensics')}
          >
            <Fingerprint size={16} />
            <span>Forensic Leak Lab</span>
          </button>
          <button
            className={`tab-btn ${adminTab === 'upload' ? 'active' : ''}`}
            onClick={() => setAdminTab('upload')}
          >
            <Upload size={16} />
            <span>Video Packaging Studio</span>
          </button>
          <button
            className={`tab-btn ${adminTab === 'audit' ? 'active' : ''}`}
            onClick={() => setAdminTab('audit')}
          >
            <Users size={16} />
            <span>Session Audit Trails</span>
          </button>
          <button
            className={`tab-btn ${adminTab === 'anomalies' ? 'active' : ''}`}
            onClick={() => setAdminTab('anomalies')}
          >
            <Globe size={16} />
            <span>Geo-Anomalies & Devices</span>
          </button>
        </div>

        <div className="admin-badge">
          <ShieldAlert size={14} color="#38bdf8" />
          <span>SecOps Admin Console</span>
        </div>
      </div>

      {/* Main Admin Grid */}
      <div className="app-grid">
        {/* Left Side: Active Admin Tab Content */}
        <div className="admin-main-column">
          {adminTab === 'forensics' && (
            <div className="upload-card">
              <div className="upload-card-header">
                <Fingerprint size={24} className="upload-header-icon" />
                <div>
                  <h3>Forensic Leak Identification Lab</h3>
                  <p>
                    Scan screen-recorded `.mp4` videos, screenshots (`.png`, `.jpg`), or paste binary bitstrings to trace leaks.
                  </p>
                </div>
              </div>

              {/* Mode A: Upload Recorded Video / Screenshot */}
              <form onSubmit={handleAnalyzeFile} className="upload-form" style={{ marginBottom: '24px' }}>
                <div className="upload-grid-fields">
                  <div className="form-group">
                    <label>Target Video ID</label>
                    <select
                      value={forensicVideoId}
                      onChange={(e) => setForensicVideoId(e.target.value)}
                      className="form-select"
                      required
                    >
                      <option value="">Select a video...</option>
                      {videosList.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.title} ({v.id})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Noise Tolerance Threshold</label>
                    <select
                      value={maxErrorRate}
                      onChange={(e) => setMaxErrorRate(e.target.value)}
                      className="form-select"
                    >
                      <option value="0.10">10% (Strict / High Quality)</option>
                      <option value="0.20">20% (Standard / Re-compressed)</option>
                      <option value="0.30">30% (Permissive / Heavy Noise)</option>
                    </select>
                  </div>
                </div>

                <label style={{ fontSize: '13px', fontWeight: 600, color: '#e5e7eb', marginBottom: '6px', display: 'block' }}>
                  Option A: Drop Recorded Video (.mp4) or Screenshot (.png, .jpg)
                </label>
                <div
                  className={`dropzone ${forensicFile ? 'has-file' : ''}`}
                  onClick={() => forensicFileInputRef.current?.click()}
                  style={{ minHeight: '110px' }}
                >
                  <input
                    ref={forensicFileInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/x-matroska,image/png,image/jpeg,image/webp"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setForensicFile(e.target.files[0]);
                      }
                    }}
                  />
                  {forensicFile ? (
                    <div className="file-info">
                      <CheckCircle2 size={30} color="#10b981" />
                      <div className="file-name">{forensicFile.name}</div>
                      <div className="file-meta">
                        {(forensicFile.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>
                  ) : (
                    <div className="dropzone-prompt">
                      <Upload size={28} color="#6b7280" />
                      <p>Click or drag & drop recorded video (.mp4) or static screenshot (.png, .jpg)</p>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isSearchingLeak || !forensicFile}
                  className="primary-btn upload-submit-btn"
                  style={{ marginTop: '12px' }}
                >
                  {isSearchingLeak ? (
                    <>
                      <div className="button-spinner"></div>
                      <span>Scanning Forensic Markers & Matching...</span>
                    </>
                  ) : (
                    <>
                      <Search size={18} />
                      <span>Scan Video / Screenshot & Trace Leaker</span>
                    </>
                  )}
                </button>
              </form>

              {/* Mode B: Manual Binary Sequence Input */}
              <form onSubmit={handleTracePattern} className="upload-form">
                <label style={{ fontSize: '13px', fontWeight: 600, color: '#e5e7eb', marginBottom: '6px', display: 'block' }}>
                  Option B: Or Manually Paste Binary Watermark Pattern (e.g. 01101001)
                </label>
                <div className="form-group">
                  <input
                    type="text"
                    placeholder="e.g. 10101100101"
                    value={extractedPattern}
                    onChange={(e) => setExtractedPattern(e.target.value)}
                    style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: '2px' }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSearchingLeak || !extractedPattern.trim()}
                  className="primary-btn upload-submit-btn"
                  style={{ marginTop: '8px', background: 'linear-gradient(135deg, #475569 0%, #334155 100%)' }}
                >
                  <Search size={18} />
                  <span>Trace Leaker from Pattern String</span>
                </button>
              </form>

              {/* Forensic Match Report Result */}
              {leakResult && (
                <div className={`forensic-report-card ${leakResult.matchFound ? 'match' : 'no-match'}`}>
                  {leakResult.matchFound ? (
                    <>
                      {/* Top Header */}
                      <div className="report-header">
                        <div className="report-title-group">
                          <h4 className="report-title">Forensic Identification Report</h4>
                          <span className="status-badge-match">Match Found</span>
                        </div>
                        <div className="report-meta-tag">
                          Confidence: <strong>{((leakResult.confidence || 0) * 100).toFixed(0)}%</strong>
                        </div>
                      </div>

                      {/* 3-Column Structured Information Grid */}
                      <div className="report-grid">
                        {/* Column 1: Student Account */}
                        <div className="report-section">
                          <h5 className="section-heading">Student Account</h5>
                          <div className="section-rows">
                            <div className="report-row">
                              <span className="row-label">Name:</span>
                              <span className="row-value font-semibold">{leakResult.studentName || 'Student'}</span>
                            </div>
                            <div className="report-row">
                              <span className="row-label">Email:</span>
                              <span className="row-value">{leakResult.studentEmail || 'N/A'}</span>
                            </div>
                            <div className="report-row">
                              <span className="row-label">Student ID:</span>
                              <code className="code-pill">{leakResult.studentId || leakResult.userId}</code>
                            </div>
                            <div className="report-row">
                              <span className="row-label">Role:</span>
                              <span className="row-value">{leakResult.role || 'STUDENT'}</span>
                            </div>
                          </div>
                        </div>

                        {/* Column 2: Session & Network */}
                        <div className="report-section">
                          <h5 className="section-heading">Session Telemetry</h5>
                          <div className="section-rows">
                            <div className="report-row">
                              <span className="row-label">Session ID:</span>
                              <code className="code-pill">{leakResult.sessionId}</code>
                            </div>
                            <div className="report-row">
                              <span className="row-label">IP Address:</span>
                              <span className="row-value">{leakResult.deviceIp || '127.0.0.1'}</span>
                            </div>
                            <div className="report-row">
                              <span className="row-label">Location:</span>
                              <span className="row-value">{leakResult.deviceLocation || 'Sri Lanka'}</span>
                            </div>
                            <div className="report-row">
                              <span className="row-label">Device:</span>
                              <span className="row-value font-medium" title={leakResult.userAgent || 'Unknown Device'}>
                                {formatUserAgent(leakResult.userAgent)}
                              </span>
                            </div>
                            <div className="report-row">
                              <span className="row-label">Timestamp:</span>
                              <span className="row-value">
                                {leakResult.issuedAt ? new Date(leakResult.issuedAt).toLocaleString() : 'N/A'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Column 3: Cryptographic Proof */}
                        <div className="report-section">
                          <h5 className="section-heading">Watermark Verification</h5>
                          <div className="section-rows">
                            <div className="report-row">
                              <span className="row-label">Video ID:</span>
                              <code className="code-pill">{leakResult.videoId || forensicVideoId}</code>
                            </div>
                            <div className="report-row">
                              <span className="row-label">Bitstream:</span>
                              <code className="code-pill pattern-code">{leakResult.extractedPattern || 'N/A'}</code>
                            </div>
                            <div className="report-row">
                              <span className="row-label">Hamming Dist:</span>
                              <span className="row-value">
                                {leakResult.hammingDistance} / {leakResult.comparedBits} bits ({((leakResult.errorRate || 0) * 100).toFixed(1)}% error)
                              </span>
                            </div>
                            <div className="report-row">
                              <span className="row-label">Result:</span>
                              <span className="text-success font-semibold">Lossless Exact Match</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="report-no-match">
                      <div className="report-header">
                        <div className="report-title-group">
                          <h4 className="report-title">Forensic Identification Report</h4>
                          <span className="status-badge-nomatch">No Match</span>
                        </div>
                      </div>
                      <p className="no-match-desc">{leakResult.message || 'No registered session matched within the configured noise threshold.'}</p>
                      {leakResult.extractedPattern && (
                        <div className="no-match-pattern">
                          <span>Extracted Bitstream:</span> <code>{leakResult.extractedPattern}</code>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {adminTab === 'upload' && (
            <div className="upload-card">
              <div className="upload-card-header">
                <Upload size={24} className="upload-header-icon" />
                <div>
                  <h3>Video Packaging & AES-128 Encryption Studio</h3>
                  <p>Upload source MP4s to package into crop-resilient A/B dual variants and upload to Azure Blob.</p>
                </div>
              </div>

              <form onSubmit={handleUploadSubmit} className="upload-form">
                <div className="upload-grid-fields">
                  <div className="form-group">
                    <label>Target Video ID</label>
                    <input
                      type="text"
                      value={uploadVideoId}
                      onChange={(e) => setUploadVideoId(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Video Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Chapter 4: Cryptographic Handshakes"
                      value={uploadTitle}
                      onChange={(e) => setUploadTitle(e.target.value)}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label>Key Rotation Period</label>
                    <select
                      value={uploadKeyRotation}
                      onChange={(e) => setUploadKeyRotation(e.target.value)}
                      className="form-select"
                    >
                      <option value="0">Single Key (Whole Stream)</option>
                      <option value="3">Rotate Key Every 3 Segments (~18s)</option>
                      <option value="5">Rotate Key Every 5 Segments (~30s)</option>
                      <option value="10">Rotate Key Every 10 Segments (~60s)</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label>Segment Duration (seconds)</label>
                    <select
                      value={uploadSegmentDuration}
                      onChange={(e) => setUploadSegmentDuration(e.target.value)}
                      className="form-select"
                    >
                      <option value="4">4 seconds (Ultra-Low Latency)</option>
                      <option value="6">6 seconds (Standard HLS)</option>
                      <option value="10">10 seconds (High Compression)</option>
                    </select>
                  </div>
                </div>

                <div
                  className={`dropzone ${uploadFile ? 'has-file' : ''}`}
                  onClick={() => uploadFileInputRef.current?.click()}
                >
                  <input
                    ref={uploadFileInputRef}
                    type="file"
                    accept="video/mp4,video/quicktime,video/x-matroska"
                    style={{ display: 'none' }}
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setUploadFile(e.target.files[0]);
                      }
                    }}
                  />
                  {uploadFile ? (
                    <div className="file-info">
                      <CheckCircle2 size={36} color="#10b981" />
                      <div className="file-name">{uploadFile.name}</div>
                      <div className="file-meta">
                        {(uploadFile.size / (1024 * 1024)).toFixed(2)} MB
                      </div>
                    </div>
                  ) : (
                    <div className="dropzone-prompt">
                      <Upload size={32} color="#6b7280" />
                      <p>Click or drag & drop source .mp4 video file here</p>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={isUploading || !uploadFile}
                  className="primary-btn upload-submit-btn"
                >
                  {isUploading ? (
                    <>
                      <div className="button-spinner"></div>
                      <span>{uploadProgress || 'Encoding Dual A/B HLS Variants...'}</span>
                    </>
                  ) : (
                    <>
                      <Upload size={18} />
                      <span>Upload & Encode to Azure Blob</span>
                    </>
                  )}
                </button>
              </form>

              {/* Uploaded Video Inventory Table & Delete Actions */}
              <div style={{ marginTop: '36px', paddingTop: '24px', borderTop: '1px solid var(--border-subtle)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Layers size={18} color="#ea580c" />
                    <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      Encrypted Video Inventory ({videosList.length})
                    </h4>
                  </div>
                  <button
                    className="secondary-btn"
                    onClick={fetchVideosList}
                    style={{ padding: '6px 12px', fontSize: '12px' }}
                    title="Refresh video inventory"
                  >
                    <RefreshCw size={13} />
                    <span>Refresh</span>
                  </button>
                </div>

                {isLoadingVideos ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-secondary)' }}>
                    Loading encrypted video records...
                  </div>
                ) : videosList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
                    No encrypted videos found in catalog. Upload your first lecture above.
                  </div>
                ) : (
                  <div className="audit-table-wrapper">
                    <table className="audit-table">
                      <thead>
                        <tr>
                          <th>Video Title</th>
                          <th>Video ID</th>
                          <th>AES-128 Keys</th>
                          <th>Created At</th>
                          <th style={{ textAlign: 'right' }}>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {videosList.map((v) => (
                          <tr key={v.id}>
                            <td>
                              <strong>{v.title}</strong>
                            </td>
                            <td>
                              <code style={{ fontSize: '12px', color: 'var(--accent-orange-hover)' }}>{v.id}</code>
                            </td>
                            <td>
                              <span className="sec-pill" style={{ display: 'inline-flex', padding: '2px 8px' }}>
                                {v.keyCount} Key{v.keyCount !== 1 ? 's' : ''}
                              </span>
                            </td>
                            <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                              {v.createdAt ? new Date(v.createdAt).toLocaleDateString() : 'Active'}
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <button
                                className="logout-action-btn"
                                onClick={() => handleDeleteVideo(v.id, v.title)}
                                disabled={deletingVideoId === v.id}
                                title="Permanently Delete Video"
                                style={{
                                  display: 'inline-flex',
                                  padding: '6px 10px',
                                  fontSize: '12px',
                                  gap: '6px',
                                  alignItems: 'center',
                                  background: '#fee2e2',
                                  color: '#dc2626',
                                  borderRadius: '8px',
                                }}
                              >
                                <Trash2 size={13} />
                                <span>{deletingVideoId === v.id ? 'Deleting...' : 'Delete'}</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {adminTab === 'audit' && (
            <div className="upload-card">
              <div className="upload-card-header">
                <Users size={24} className="upload-header-icon" />
                <div>
                  <h3>Registered Forensic Sessions Audit Trail</h3>
                  <p>All issued streaming sessions and deterministic A/B watermark patterns in PostgreSQL.</p>
                </div>
              </div>

              {isLoadingAudit ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                  Loading session records from database...
                </div>
              ) : auditLogs.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  No watermark sessions recorded yet. Launch a student stream to generate audit records.
                </div>
              ) : (
                <div className="audit-table-wrapper">
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>User ID</th>
                        <th>Session ID</th>
                        <th>Video ID</th>
                        <th>Watermark Pattern</th>
                        <th>Segments</th>
                        <th>Issued At</th>
                      </tr>
                    </thead>
                    <tbody>
                      {auditLogs.map((log) => (
                        <tr key={log.id}>
                          <td><strong>{log.userId}</strong></td>
                          <td><code>{log.sessionId}</code></td>
                          <td>{log.videoId}</td>
                          <td><code className="pattern-badge">{log.pattern}</code></td>
                          <td>{log.segmentCount}</td>
                          <td style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {new Date(log.issuedAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {adminTab === 'anomalies' && (
            <div className="upload-card">
              <div className="upload-card-header" style={{ justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <Globe size={24} className="upload-header-icon" />
                  <div>
                    <h3>Geo-Anomaly & Impossible Travel Flags</h3>
                    <p>Haversine distance & travel speed heuristics detecting impossible multi-region logins.</p>
                  </div>
                </div>
                <button
                  className="clear-btn"
                  onClick={fetchAnomalies}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <RefreshCw size={14} /> Refresh
                </button>
              </div>

              {isLoadingAnomalies ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#94a3b8' }}>
                  Loading anomaly records...
                </div>
              ) : anomalies.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '30px', color: '#64748b' }}>
                  No impossible travel anomalies flagged. All student logins are within plausible geographic travel speeds (&le; 900 km/h).
                </div>
              ) : (
                <div className="audit-table-wrapper">
                  <table className="audit-table">
                    <thead>
                      <tr>
                        <th>User ID</th>
                        <th>Current Location</th>
                        <th>Previous Location</th>
                        <th>Distance</th>
                        <th>Time Delta</th>
                        <th>Speed (km/h)</th>
                        <th>Action</th>
                        <th>Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {anomalies.map((anom) => (
                        <tr key={anom.id}>
                          <td><strong>{anom.userId}</strong></td>
                          <td><code>{anom.currentGeo || anom.currentIp}</code></td>
                          <td><code>{anom.prevGeo || anom.prevIp}</code></td>
                          <td>{anom.distanceKm} km</td>
                          <td>{(anom.timeDeltaHours * 60).toFixed(1)} mins</td>
                          <td>
                            <span className="lesson-badge" style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#fca5a5' }}>
                              {anom.implausibleSpeedKmh} km/h
                            </span>
                          </td>
                          <td>
                            <code style={{ color: '#38bdf8' }}>{anom.actionTaken}</code>
                          </td>
                          <td style={{ fontSize: '11px', color: '#94a3b8' }}>
                            {new Date(anom.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Live Security & Network Inspector */}
        <aside className="controls-aside">
          <div className="inspector-card">
            <div className="inspector-header">
              <div className="inspector-title">
                <Layers size={18} />
                <h3>Live Security & Network Inspector</h3>
              </div>
              <button
                className="clear-btn"
                onClick={onClearLogs}
                title="Clear logs"
              >
                <Trash2 size={14} />
              </button>
            </div>

            {/* Filter Pills */}
            <div className="log-filter-bar">
              <button
                className={`filter-pill ${logFilter === 'all' ? 'active' : ''}`}
                onClick={() => setLogFilter('all')}
              >
                ALL
              </button>
              <button
                className={`filter-pill ${logFilter === 'security' ? 'active' : ''}`}
                onClick={() => setLogFilter('security')}
              >
                SECURITY
              </button>
              <button
                className={`filter-pill ${logFilter === 'network' ? 'active' : ''}`}
                onClick={() => setLogFilter('network')}
              >
                NETWORK
              </button>
              <button
                className={`filter-pill ${logFilter === 'error' ? 'active' : ''}`}
                onClick={() => setLogFilter('error')}
              >
                ERROR
              </button>
            </div>

            {/* Scrollable Log Stream */}
            <div className="log-stream">
              {filteredLogs.length === 0 ? (
                <div className="empty-logs">No log events recorded.</div>
              ) : (
                filteredLogs.map((item) => (
                  <div key={item.id} className={`log-entry ${item.type}`}>
                    <div className="log-meta">
                      <span className="log-time">[{item.time}]</span>
                      <span className={`log-badge ${item.type}`}>
                        {item.type}
                      </span>
                    </div>
                    <div className="log-msg">{item.message}</div>
                    {item.details && (
                      <div className="log-details">{item.details}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
export default AdminPortal;
