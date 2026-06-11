package main

import (
	"encoding/binary"
	"fmt"
	"math"
	"net"
	"os"
	"path/filepath"
	"time"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

const defaultPort = "7777"

// Telemetry is the subset of Forza "Data Out" we forward to the UI.
// JSON tags match the field names the frontend (telemetry.js) reads.
type Telemetry struct {
	IsRaceOn   bool       `json:"isRaceOn"`
	Rpm        float32    `json:"rpm"`
	MaxRpm     float32    `json:"maxRpm"`
	SpeedKmh   float32    `json:"speedKmh"`
	SpeedMph   float32    `json:"speedMph"`
	PowerHp    float32    `json:"powerHp"`
	TorqueNm   float32    `json:"torqueNm"`
	Pi         int32      `json:"pi"`
	CarClass   int32      `json:"carClass"`
	CarOrdinal int32      `json:"carOrdinal"`
	Drivetrain string     `json:"drivetrain"`
	Gear       int        `json:"gear"`
	Accel      int        `json:"accel"`
	Brake      int        `json:"brake"`
	TireTempC    [4]float32 `json:"tireTempC"`    // FL, FR, RL, RR
	TireTempF    [4]float32 `json:"tireTempF"`    // FL, FR, RL, RR
	SuspTravel   [4]float32 `json:"suspTravel"`   // normalized 0..1, FL, FR, RL, RR
	SlipAngle    [4]float32 `json:"slipAngle"`    // lateral slip, FL, FR, RL, RR
	SlipRatio    [4]float32 `json:"slipRatio"`    // longitudinal: + = wheelspin, - = lockup
	WheelSpeed   [4]float32 `json:"wheelSpeed"`   // wheel rotation rad/s, FL, FR, RL, RR
	CombinedSlip [4]float32 `json:"combinedSlip"` // overall grip loss (>1 = sliding), FL..RR
	YawRate      float32    `json:"yawRate"`      // angular velocity Y (rad/s)
	AccelLat     float32    `json:"accelLat"`     // lateral G (AccelerationX, +right) m/s^2
	AccelLong    float32    `json:"accelLong"`    // longitudinal G (AccelerationZ, +fwd) m/s^2
	Steer        int        `json:"steer"`        // steering input -127..127
	Boost        float32    `json:"boost"`
	Fuel         float32    `json:"fuel"`
}

func f32(b []byte, off int) float32 {
	return math.Float32frombits(binary.LittleEndian.Uint32(b[off : off+4]))
}

func i32(b []byte, off int) int32 {
	return int32(binary.LittleEndian.Uint32(b[off : off+4]))
}

func drivetrainName(t int32) string {
	switch t {
	case 0:
		return "FWD"
	case 1:
		return "RWD"
	case 2:
		return "AWD"
	}
	return ""
}

// parsePacket decodes a Forza Horizon "Dash" UDP packet.
//
// Layout reference (little-endian): the first 232 bytes are the shared
// "sled" block. Horizon titles (FH4/FH5/FH6) insert 12 bytes of padding
// after the sled, so the "dash" block begins at byte 244. Forza Motorsport's
// "car dash" format has no padding, so its dash block begins at byte 232.
// We pick the dash offset from the packet length.
func parsePacket(b []byte) (Telemetry, bool) {
	var t Telemetry

	var dash int
	switch {
	case len(b) >= 324: // FH4 / FH5 / FH6
		dash = 244
	case len(b) >= 311: // FM "car dash"
		dash = 232
	default:
		return t, false // sled-only or unknown — not enough for our fields
	}

	// Shared sled block (same offsets for every title).
	t.IsRaceOn = i32(b, 0) == 1
	t.MaxRpm = f32(b, 8)
	t.Rpm = f32(b, 16)
	t.AccelLat = f32(b, 20)  // AccelerationX (+ = right)
	t.AccelLong = f32(b, 28) // AccelerationZ (+ = forward)
	t.YawRate = f32(b, 48)   // AngularVelocityY
	for i := 0; i < 4; i++ {
		t.SuspTravel[i] = f32(b, 68+i*4)
		t.SlipRatio[i] = f32(b, 84+i*4)
		t.WheelSpeed[i] = f32(b, 100+i*4)
		t.SlipAngle[i] = f32(b, 164+i*4)
		t.CombinedSlip[i] = f32(b, 180+i*4)
	}
	t.CarOrdinal = i32(b, 212)
	t.CarClass = i32(b, 216)
	t.Pi = i32(b, 220)
	t.Drivetrain = drivetrainName(i32(b, 224))

	// Dash block (offsets relative to `dash`).
	t.SpeedKmh = f32(b, dash+12) * 3.6 // m/s -> km/h
	t.SpeedMph = t.SpeedKmh * 0.621371
	t.PowerHp = f32(b, dash+16) / 745.7 // watts -> hp
	t.TorqueNm = f32(b, dash+20)
	for i := 0; i < 4; i++ {
		tf := f32(b, dash+24+i*4) // tire temps are reported in °F
		t.TireTempF[i] = tf
		t.TireTempC[i] = (tf - 32) * 5 / 9
	}
	t.Boost = f32(b, dash+40)
	t.Fuel = f32(b, dash+44)
	t.Accel = int(b[dash+71])
	t.Brake = int(b[dash+72])
	t.Gear = int(b[dash+75])
	t.Steer = int(int8(b[dash+76])) // signed -127..127
	return t, true
}

// startTelemetry launches the UDP listener (or a demo generator) in the
// background. Called once from App.startup.
//
//	FORZA_PORT=7777   override the UDP port Forza is configured to send to
//	FORZA_DEMO=1      emit synthetic telemetry so the UI can be tested
//	                  without the game running
//	FORZA_DEBUG=1     write forza_debug.log (raw packet dump + parsed values)
//	                  for validating the byte offsets against the live game
func (a *App) startTelemetry() {
	if os.Getenv("FORZA_DEMO") == "1" {
		go a.runDemo()
		return
	}
	port := os.Getenv("FORZA_PORT")
	if port == "" {
		port = defaultPort
	}
	go a.listenUDP(":" + port)
}

func (a *App) listenUDP(addr string) {
	udpAddr, err := net.ResolveUDPAddr("udp", addr)
	if err != nil {
		runtime.LogError(a.ctx, "telemetry resolve: "+err.Error())
		return
	}
	conn, err := net.ListenUDP("udp", udpAddr)
	if err != nil {
		runtime.LogError(a.ctx, "telemetry listen: "+err.Error())
		return
	}
	defer conn.Close()
	runtime.LogInfo(a.ctx, "Forza telemetry listening on "+addr)

	debug := os.Getenv("FORZA_DEBUG") == "1"
	if debug {
		a.openDebugLog()
	}

	buf := make([]byte, 2048)
	for {
		n, _, err := conn.ReadFromUDP(buf)
		if err != nil {
			continue
		}
		tel, ok := parsePacket(buf[:n])
		if debug {
			a.debugPacket(buf[:n], tel, ok)
		}
		if ok {
			runtime.EventsEmit(a.ctx, "telemetry", tel)
		}
	}
}

// runDemo emits believable fake telemetry at 20 Hz so the dashboard and
// auto-fill can be verified without launching Forza.
func (a *App) runDemo() {
	tick := time.NewTicker(50 * time.Millisecond)
	defer tick.Stop()
	start := time.Now()
	runtime.LogInfo(a.ctx, "Forza telemetry running in DEMO mode")

	for range tick.C {
		s := time.Since(start).Seconds()

		// Walk a synthetic 9-second corner so the phase-aware detectors have
		// something to chew on: brake + turn-in, then a trailing-throttle mid
		// phase, then a power-down exit.
		cyc := math.Mod(s, 9)
		accel, brake, steer := 255, 0, 30
		switch {
		case cyc < 2.5: // entry: hard braking + turn-in
			accel, brake, steer = 0, 210, 45
		case cyc < 5: // mid: maintenance throttle
			accel, brake, steer = 70, 0, 55
		}

		rpm := float32(3000 + 3800*(0.5+0.5*math.Sin(s*2)))
		tel := Telemetry{
			IsRaceOn:   true,
			MaxRpm:     7200,
			Rpm:        rpm,
			SpeedKmh:   float32(90 + 70*(0.5+0.5*math.Sin(s*0.35))),
			PowerHp:    470,
			TorqueNm:   540,
			Pi:         781,
			CarClass:   5,
			CarOrdinal: 2785,
			Drivetrain: "RWD",
			Gear:       2 + int(math.Mod(s, 5)),
			Accel:      accel,
			Brake:      brake,
			Steer:      steer,
			AccelLat:   float32(8 * math.Sin(s*0.35)),
		}
		tel.SpeedMph = tel.SpeedKmh * 0.621371
		wheel := rpm / 60 * 2 * math.Pi / 3 // rough rad/s
		for i := 0; i < 4; i++ {
			c := float32(72 + 22*math.Sin(s*0.6+float64(i)))
			tel.TireTempC[i] = c
			tel.TireTempF[i] = c*9/5 + 32
			tel.SuspTravel[i] = float32(0.5 + 0.28*math.Sin(s*1.5+float64(i)))
			tel.SlipAngle[i] = float32(1.2 * math.Sin(s*1.2+float64(i)*0.7))
			tel.WheelSpeed[i] = wheel
		}
		// Phase-specific slip so e3 (front lock), e1 (entry understeer),
		// x1 (power oversteer) and x3 (inside-wheel spin) actually surface.
		if brake > 100 {
			tel.SlipRatio[0], tel.SlipRatio[1] = -0.7, -0.6 // front lockup
			tel.SlipAngle[0], tel.SlipAngle[1] = 1.6, 1.6   // entry understeer
		} else if accel > 200 {
			tel.SlipRatio[2], tel.SlipRatio[3] = 0.7, 0.45 // rear spin
			tel.SlipAngle[2], tel.SlipAngle[3] = 1.7, 1.7  // power oversteer
			tel.WheelSpeed[2] *= 1.25                      // inside wheel faster
		}
		for i := 0; i < 4; i++ {
			tel.CombinedSlip[i] = float32(math.Abs(float64(tel.SlipRatio[i]))) + 0.3
		}
		runtime.EventsEmit(a.ctx, "telemetry", tel)
	}
}

// ── debug logging (FORZA_DEBUG=1) ───────────────────────────────────────────
// These are only touched from the single listenUDP goroutine, so no locking.

var (
	debugFile     *os.File
	debugFirst    = true
	debugLastLine time.Time
)

func (a *App) openDebugLog() {
	dir := "."
	if exe, err := os.Executable(); err == nil {
		dir = filepath.Dir(exe)
	}
	path := filepath.Join(dir, "forza_debug.log")
	f, err := os.Create(path)
	if err != nil {
		path = filepath.Join(os.TempDir(), "forza_debug.log")
		f, err = os.Create(path)
	}
	if err != nil {
		runtime.LogError(a.ctx, "debug log: "+err.Error())
		return
	}
	debugFile = f
	runtime.LogInfo(a.ctx, "Forza debug log: "+path)
	fmt.Fprintf(f, "Forza Tunes debug log — %s\n", time.Now().Format(time.RFC3339))
	fmt.Fprintf(f, "How to read: when the FIRST PACKET dump appears below, find the row whose\n")
	fmt.Fprintf(f, "value matches a number on the game's HUD, e.g. Torque (Nm) appears as a float32,\n")
	fmt.Fprintf(f, "Power is in watts (hp x ~745.7), PI is an int32. That row's offset is the field.\n")
}

func (a *App) debugPacket(b []byte, tel Telemetry, ok bool) {
	if debugFile == nil {
		return
	}

	// One-time exhaustive dump so every field can be located by value.
	if debugFirst {
		debugFirst = false
		fmt.Fprintf(debugFile, "\n=== FIRST PACKET: %d bytes ===\n", len(b))
		fmt.Fprintf(debugFile, "%6s | %14s | %s\n", "offset", "int32", "float32")
		for off := 0; off+4 <= len(b); off += 4 {
			fmt.Fprintf(debugFile, "%6d | %14d | %g\n", off, i32(b, off), f32(b, off))
		}
		debugFile.Sync()
	}

	// Once-per-second summary of what we currently parse.
	now := time.Now()
	if now.Sub(debugLastLine) < time.Second {
		return
	}
	debugLastLine = now
	if !ok {
		fmt.Fprintf(debugFile, "[%s] len=%d — too short to parse\n",
			now.Format("15:04:05"), len(b))
	} else {
		fmt.Fprintf(debugFile,
			"[%s] len=%d raceOn=%v rpm=%.0f/%.0f speed=%.1fkm/h pwr=%.0fhp trq=%.0fNm PI=%d %s gear=%d tires=%.0f/%.0f/%.0f/%.0f°C\n",
			now.Format("15:04:05"), len(b), tel.IsRaceOn, tel.Rpm, tel.MaxRpm,
			tel.SpeedKmh, tel.PowerHp, tel.TorqueNm, tel.Pi, tel.Drivetrain, tel.Gear,
			tel.TireTempC[0], tel.TireTempC[1], tel.TireTempC[2], tel.TireTempC[3])
	}
	debugFile.Sync()
}
