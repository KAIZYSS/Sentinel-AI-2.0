import { useState, useEffect } from 'react'
import { api } from '../lib/api'
import { supabase } from '../lib/supabase'
import { useLocation } from '../context/LocationContext'
import Map from 'react-map-gl/maplibre'
import DeckGL from '@deck.gl/react'
import { H3HexagonLayer } from '@deck.gl/geo-layers'
import { FlyToInterpolator } from '@deck.gl/core'
import { cellToLatLng, latLngToCell } from 'h3-js'
import 'maplibre-gl/dist/maplibre-gl.css'

// Dark matter style for a sleek dark mode map
const MAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'

const INITIAL_VIEW_STATE = {
  longitude: 78.9629, // India center
  latitude: 20.5937,
  zoom: 4.8,
  pitch: 35,
  bearing: 0
}

// Gold / Black themed gradient for outbreak intensity
const confToColor = (c) => {
  if (c < 30)  return [125, 102, 28, 200]  // Dim Bronze-Gold (Emerging)
  if (c < 60)  return [212, 175, 55, 220]  // Solid Gold (Elevated)
  return [245, 158, 11, 250]              // Bright Gold-Amber (High Confidence)
}

// District Coordinate Lookups for instant zoom mapping
const DISTRICT_COORDS = {
  "Bhopal": [23.2599, 77.4126],
  "Indore": [22.7196, 75.8577],
  "Gwalior": [26.2183, 78.1828],
  "Jabalpur": [23.1815, 79.9864],
  "Ujjain": [23.1828, 75.7772],
  "Sagar MP": [23.8388, 78.7378],
  "Satna": [24.5857, 80.8322],
  "Rewa": [24.5373, 81.3042],
  "Delhi Central": [28.6438, 77.2090],
  "Delhi East": [28.6273, 77.2903],
  "Delhi North": [28.7041, 77.1025],
  "Delhi South": [28.5335, 77.1897],
  "Delhi West": [28.6588, 76.9945],
  "New Delhi": [28.6139, 77.2090],
  "Ludhiana": [30.9010, 75.8573],
  "Amritsar": [31.6340, 74.8723],
  "Jalandhar": [31.3260, 75.5762],
  "Patiala": [30.3398, 76.3869],
  "Bathinda": [30.2110, 74.9455],
  "Mohali": [30.7046, 76.7179],
  "Mumbai": [19.0760, 72.8777],
  "Pune": [18.5204, 73.8567],
  "Nagpur": [21.1458, 79.0882],
  "Nashik": [19.9975, 73.7898],
  "Aurangabad": [19.8762, 75.3433],
  "Solapur": [17.6599, 75.9064],
  "Thane": [19.2183, 72.9781],
  "Kolhapur": [16.7050, 74.2433],
  "Amravati": [20.9320, 77.7523],
  "Nanded": [19.1383, 77.3210],
  "Chennai": [13.0827, 80.2707],
  "Chengalpattu": [12.6841, 79.9836],
  "Coimbatore": [11.0168, 76.9558],
  "Madurai": [9.9252, 78.1198],
  "Tiruchirappalli": [10.7905, 78.7047],
  "Salem": [11.6643, 78.1460],
  "Erode": [11.3410, 77.7172],
  "Tirunelveli": [8.7139, 77.7567],
  "Vellore": [12.9165, 79.1325],
  "Thanjavur": [10.7870, 79.1378],
  "Bengaluru": [12.9716, 77.5946],
  "Bengaluru Urban": [12.9716, 77.5946],
  "Mysuru": [12.2958, 76.6394],
  "Hubballi": [15.3647, 75.1240],
  "Mangaluru": [12.9141, 74.8560],
  "Belagavi": [15.8497, 74.4977],
  "Kalaburagi": [17.3297, 76.8343],
  "Davanagere": [14.4644, 75.9218],
  "Ballari": [15.1394, 76.9214],
  "Shivamogga": [13.9299, 75.5681],
  "Hyderabad": [17.3850, 78.4867],
  "Warangal": [17.9689, 79.5941],
  "Nizamabad": [18.6725, 78.0941],
  "Karimnagar": [18.4386, 79.1288],
  "Khammam": [17.2473, 80.1514],
  "Mahbubnagar": [16.7371, 77.9874],
  "Kolkata": [22.5726, 88.3639],
  "Howrah": [22.5958, 88.2636],
  "Durgapur": [23.5204, 87.3119],
  "Asansol": [23.6889, 86.9661],
  "Siliguri": [26.7271, 88.3953],
  "Bardhaman": [23.2324, 87.8615],
  "Ahmedabad": [23.0225, 72.5714],
  "Surat": [21.1702, 72.8311],
  "Vadodara": [22.3072, 73.1812],
  "Rajkot": [22.3039, 70.8022],
  "Bhavnagar": [21.7645, 72.1519],
  "Jamnagar": [22.4707, 70.0577],
  "Gandhinagar": [23.2156, 72.6369],
  "Junagadh": [21.5222, 70.4579],
  "Kozhikode": [11.2588, 75.7804],
  "Kochi": [9.9312, 76.2673],
  "Thiruvananthapuram": [8.5241, 76.9366],
  "Thrissur": [10.5276, 76.2144],
  "Kollam": [8.8932, 76.6141],
  "Kannur": [11.8745, 75.3704],
  "Palakkad": [10.7867, 76.6548],
  "Malappuram": [11.0510, 76.0711],
  "Alappuzha": [9.4981, 76.3388]
}

export default function Heatmap() {
  const { district } = useLocation()
  const [viewState, setViewState] = useState(INITIAL_VIEW_STATE)
  const [hexData, setHexData] = useState([])
  const [timeline, setTimeline] = useState([])
  const [currentFrameIdx, setCurrentFrameIdx] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768)
  const [panelCollapsed, setPanelCollapsed] = useState(window.innerWidth <= 768)

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        const [heatmap, tl] = await Promise.all([api.getHeatmap(district), api.getTimeline()])
        
        setHexData(heatmap)
        setTimeline(tl)
        setCurrentFrameIdx(tl.length - 1)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    
    loadData()
  }, [district])

  // Zoom map view based on the selected location district context
  useEffect(() => {
    if (!district) return

    const zoomToDistrict = async () => {
      // 1. Try to find coordinates from currently loaded hexes
      const districtHexes = hexData.filter(h => h.district?.toLowerCase() === district.toLowerCase())
      if (districtHexes.length > 0) {
        let sumLat = 0, sumLng = 0
        let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
        let validCount = 0

        districtHexes.forEach(h => {
          if (h.hex_id && h.hex_id !== 'unknown') {
            try {
              const [lat, lng] = cellToLatLng(h.hex_id)
              sumLat += lat
              sumLng += lng
              if (lat < minLat) minLat = lat
              if (lat > maxLat) maxLat = lat
              if (lng < minLng) minLng = lng
              if (lng > maxLng) maxLng = lng
              validCount++
            } catch (e) {}
          }
        })

        if (validCount > 0) {
          const avgLat = sumLat / validCount
          const avgLng = sumLng / validCount
          const maxSpread = Math.max(maxLat - minLat, maxLng - minLng)
          let calculatedZoom = 7.2
          if (maxSpread > 0.005) {
            calculatedZoom = Math.min(7.2, Math.max(5.8, Math.log2(360 / maxSpread) - 4))
          }

          setViewState({
            longitude: avgLng,
            latitude: avgLat,
            zoom: calculatedZoom,
            pitch: 45,
            bearing: -10,
            transitionDuration: 1200,
            transitionInterpolator: new FlyToInterpolator()
          })
          return
        }
      }

      // 2. Try to fetch from reports_data table directly
      try {
        const { data } = await supabase
          .from('reports_data')
          .select('lat, lon')
          .eq('district', district)

        if (data && data.length > 0) {
          let sumLat = 0, sumLng = 0
          let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180
          let validCount = 0

          data.forEach(d => {
            if (d.lat && d.lon) {
              sumLat += d.lat
              sumLng += d.lon
              if (d.lat < minLat) minLat = d.lat
              if (d.lat > maxLat) maxLat = d.lat
              if (d.lon < minLng) minLng = d.lon
              if (d.lon > maxLng) maxLng = d.lon
              validCount++
            }
          })

          if (validCount > 0) {
            const avgLat = sumLat / validCount
            const avgLng = sumLng / validCount
            const maxSpread = Math.max(maxLat - minLat, maxLng - minLng)
            let calculatedZoom = 7.2
            if (maxSpread > 0.005) {
              calculatedZoom = Math.min(7.2, Math.max(5.8, Math.log2(360 / maxSpread) - 4))
            }

            setViewState({
              longitude: avgLng,
              latitude: avgLat,
              zoom: calculatedZoom,
              pitch: 45,
              bearing: -10,
              transitionDuration: 1200,
              transitionInterpolator: new FlyToInterpolator()
            })
            return
          }
        }
      } catch (err) {
        console.error("Supabase coordinate lookup failed", err)
      }

      // 3. Fallback to coordinate dictionary
      const fallback = DISTRICT_COORDS[district]
      if (fallback) {
        setViewState({
          longitude: fallback[1],
          latitude: fallback[0],
          zoom: 7.2,
          pitch: 45,
          bearing: -10,
          transitionDuration: 1200,
          transitionInterpolator: new FlyToInterpolator()
        })
      }
    }

    zoomToDistrict()
  }, [district, hexData])

  // Auto-play timeline logic
  useEffect(() => {
    let interval
    if (isPlaying && timeline.length > 0) {
      interval = setInterval(() => {
        setCurrentFrameIdx(prev => {
          if (prev >= timeline.length - 1) {
            setIsPlaying(false)
            return prev
          }
          return prev + 1
        })
      }, 1000)
    }
    return () => clearInterval(interval)
  }, [isPlaying, timeline])

  const activeData = isPlaying || currentFrameIdx !== (timeline.length - 1) 
    ? (timeline[currentFrameIdx]?.data || []) 
    : hexData

  const layers = [
    new H3HexagonLayer({
      id: 'h3-hexagon-layer',
      data: activeData,
      pickable: true,
      wireframe: false,
      filled: true,
      extruded: true,
      elevationScale: isMobile ? 15 : 50,
      getHexagon: d => d.hex_id,
      getFillColor: d => confToColor(d.confidence),
      getElevation: d => d.report_count || 1,
      updateTriggers: {
        getFillColor: [activeData],
        getElevation: [activeData]
      },
      transitions: {
        getElevation: 500,
        getFillColor: 500
      }
    })
  ]

  const formatOffset = (hours) => {
    if (hours === 0) return 'Live'
    return `${hours}h ago`
  }

  return (
    <div className="animate-in" style={{ position: 'relative', width: '100%', height: 'calc(100vh - 100px)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
      {loading && (
        <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10, color: 'var(--gold)', background: 'var(--bg2)', padding: '10px 20px', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <i className="ti ti-loader" style={{ animation: 'spin 1s linear infinite', marginRight: '6px' }} /> Loading Map...
        </div>
      )}
      
      <DeckGL
        viewState={viewState}
        onViewStateChange={({ viewState }) => setViewState(viewState)}
        controller={true}
        layers={layers}
        getTooltip={({object}) => object && {
          html: `
            <div style="font-family: Outfit, sans-serif; padding: 6px;">
              <div style="font-size: 11px; color: #9C9686; margin-bottom: 4px;">${object.district || 'Unknown District'}</div>
              <div style="font-weight: 800; font-size: 14px; margin-bottom: 2px; color: #D4AF37;">Conf: ${object.confidence.toFixed(1)}%</div>
              <div style="font-size: 12px; color: #F5F1E8;">Reports: ${object.report_count}</div>
              <div style="font-size: 12px; color: #b8972e;">Symptom: ${object.dominant_symptom?.replace(/_/g, ' ')}</div>
            </div>
          `,
          style: {
            backgroundColor: 'rgba(5, 7, 11, 0.95)',
            border: '1px solid rgba(212, 175, 55, 0.25)',
            borderRadius: '8px',
            color: '#fff',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            backdropFilter: 'blur(4px)'
          }
        }}
      >
        <Map mapStyle={MAP_STYLE} />
      </DeckGL>

      {/* District Intelligence Panel */}
      {(() => {
        const clusterCount = hexData.length;
        const maxConf = hexData.length ? Math.max(...hexData.map(h => h.confidence)) : 0;
        const minConf = hexData.length ? Math.min(...hexData.map(h => h.confidence)) : 0;
        const totalReports = hexData.reduce((sum, h) => sum + (h.report_count || 0), 0);
        
        // Compute dominant disease (most frequent)
        const diseaseCounts = {};
        hexData.forEach(h => {
          const d = h.dominant_symptom || 'Unknown';
          diseaseCounts[d] = (diseaseCounts[d] || 0) + 1;
        });
        const diseases = Object.entries(diseaseCounts).sort((a, b) => b[1] - a[1]);
        const dominantDisease = diseases[0]?.[0] || 'None detected';
        
        // Intelligence status from max confidence
        let statusLabel, statusColor;
        if (maxConf >= 80) { statusLabel = 'Verified Outbreak'; statusColor = 'var(--red)'; }
        else if (maxConf >= 60) { statusLabel = 'High Confidence Signal'; statusColor = 'var(--amber)'; }
        else if (maxConf >= 40) { statusLabel = 'Elevated Activity'; statusColor = 'var(--gold)'; }
        else if (maxConf > 0) { statusLabel = 'Emerging Cluster'; statusColor = 'var(--gold3)'; }
        else { statusLabel = 'Monitoring Required'; statusColor = 'var(--text3)'; }
        
        return (
          <div style={{ 
            position: 'absolute', 
            top: 16, 
            left: 16, 
            zIndex: 1, 
            background: 'rgba(5, 7, 11, 0.92)', 
            backdropFilter: 'blur(14px)', 
            border: '1px solid var(--border)', 
            padding: panelCollapsed ? '8px 16px' : '18px 20px', 
            borderRadius: 14, 
            width: isMobile ? 'calc(100vw - 32px)' : 300,
            maxWidth: 300,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)' 
          }}>
            {/* Header */}
            <div 
              onClick={() => setPanelCollapsed(!panelCollapsed)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', minHeight: '44px', marginBottom: panelCollapsed ? 0 : 14 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: statusColor, boxShadow: `0 0 10px ${statusColor}`, animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>District Intelligence</span>
              </div>
              <i className={`ti ti-chevron-${panelCollapsed ? 'down' : 'up'}`} style={{ color: 'var(--text3)', fontSize: 14 }} />
            </div>
            
            {!panelCollapsed && (
              <>
                {/* District & Status */}
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 600, marginBottom: 2 }}>CURRENT DISTRICT</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.3px' }}>{district || 'All Regions'}</div>
                  <div style={{ marginTop: 6, display: 'inline-block', background: `${statusColor}15`, border: `1px solid ${statusColor}40`, padding: '3px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, color: statusColor, letterSpacing: '0.5px' }}>
                    {statusLabel}
                  </div>
                </div>
                
                {/* Metrics Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.5px' }}>ACTIVE CLUSTERS</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gold)', marginTop: 2 }}>{clusterCount}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.5px' }}>STRONGEST SIGNAL</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: statusColor, marginTop: 2 }}>{maxConf.toFixed(1)}%</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.5px' }}>TOTAL REPORTS</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginTop: 2 }}>{totalReports}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.5px' }}>CONFIDENCE RANGE</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text2)', marginTop: 2 }}>{minConf.toFixed(0)}–{maxConf.toFixed(0)}%</div>
                  </div>
                </div>
                
                {/* Dominant Disease */}
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.5px', marginBottom: 4 }}>DOMINANT DISEASE</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gold)' }}>{dominantDisease}</div>
                </div>
                
                {/* Active Diseases */}
                {diseases.length > 1 && (
                  <div>
                    <div style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 700, letterSpacing: '0.5px', marginBottom: 6 }}>ACTIVE DISEASES</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {diseases.slice(0, 4).map(([name, count]) => (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                          <span style={{ color: 'var(--text2)' }}>{name}</span>
                          <span style={{ color: 'var(--text3)', fontFamily: 'monospace', fontSize: 10 }}>{count} cluster{count > 1 ? 's' : ''}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Timeline Player */}
      {timeline.length > 0 && (
        <div style={{ 
          position: 'absolute', bottom: 30, left: '50%', transform: 'translateX(-50%)', 
          width: '90%', maxWidth: 700, zIndex: 1, 
          background: 'rgba(5, 7, 11, 0.85)', backdropFilter: 'blur(8px)', 
          border: '1px solid var(--border)', padding: '16px 24px', borderRadius: 100,
          display: 'flex', alignItems: 'center', gap: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.5)'
        }}>
          <button 
            onClick={() => {
              if (currentFrameIdx >= timeline.length - 1) setCurrentFrameIdx(0);
              setIsPlaying(!isPlaying)
            }}
            style={{ 
              width: 40, height: 40, borderRadius: 20, background: 'var(--gold)', color: 'var(--bg)', 
              border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0, transition: 'transform 0.1s'
            }}
            onMouseDown={e => e.currentTarget.style.transform = 'scale(0.95)'}
            onMouseUp={e => e.currentTarget.style.transform = 'scale(1)'}
          >
            <i className={`ti ${isPlaying ? 'ti-player-pause' : 'ti-player-play'}`} style={{ fontSize: 20, marginLeft: isPlaying ? 0 : 2 }} />
          </button>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>
              <span>Outbreak Timeline Preview</span>
              <span style={{ color: 'var(--gold)' }}>{formatOffset(timeline[currentFrameIdx]?.time_offset_hours)}</span>
            </div>
            <input 
              type="range" 
              min={0} 
              max={timeline.length - 1} 
              value={currentFrameIdx}
              onChange={(e) => {
                setCurrentFrameIdx(parseInt(e.target.value))
                setIsPlaying(false)
              }}
              style={{ width: '100%', cursor: 'pointer', accentColor: 'var(--gold)' }} 
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text3)' }}>
              <span>-24h</span>
              <span>Live</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
