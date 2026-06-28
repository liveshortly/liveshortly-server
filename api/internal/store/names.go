package store

import (
	"crypto/rand"
	"fmt"
	"math/big"
)

// Friendly, memorable session names in the shape "adjective-noun-NNNN" (e.g.
// "luminous-otter-4821"). The keyspace is len(adjectives) × len(nouns) × 10000;
// with the lists below that is well over 90 million combinations, so collisions
// stay negligible even with 100K+ concurrent sessions.

var nameAdjectives = []string{
	"amber", "azure", "blazing", "bold", "brave", "bright", "brisk", "calm",
	"clever", "cobalt", "cosmic", "crimson", "crisp", "daring", "dawn", "deft",
	"eager", "electric", "ember", "fabled", "fearless", "fierce", "fleet", "gallant",
	"gentle", "gilded", "glowing", "golden", "grand", "hardy", "hidden", "humble",
	"icy", "indigo", "ivory", "jade", "jolly", "keen", "kindred", "lively",
	"lucid", "lunar", "luminous", "mellow", "merry", "mighty", "mystic", "neon",
	"nimble", "noble", "opal", "polar", "prime", "proud", "quick", "quiet",
	"radiant", "rapid", "regal", "rustic", "sage", "scarlet", "serene", "sharp",
	"silent", "silver", "sleek", "smooth", "solar", "spry", "stellar", "stoic",
	"sunny", "swift", "tidy", "tranquil", "true", "twilight", "valiant", "velvet",
	"vivid", "wandering", "wild", "wise", "witty", "zesty",
}

var nameNouns = []string{
	"otter", "falcon", "lynx", "heron", "marten", "badger", "raven", "willow",
	"cedar", "comet", "harbor", "meadow", "canyon", "summit", "delta", "ember",
	"quartz", "cobra", "panther", "jaguar", "bison", "moose", "stag", "ibis",
	"osprey", "kestrel", "puffin", "narwhal", "manta", "orca", "dolphin", "sparrow",
	"finch", "robin", "magpie", "hawk", "eagle", "owl", "fox", "wolf",
	"bear", "elk", "deer", "hare", "mole", "vole", "newt", "gecko",
	"viper", "python", "iguana", "turtle", "coral", "reef", "tide", "wave",
	"river", "brook", "creek", "fjord", "glade", "grove", "thicket", "marsh",
	"dune", "mesa", "ridge", "valley", "peak", "cliff", "vale", "moor",
	"aurora", "nebula", "quasar", "pulsar", "meteor", "nova", "zephyr", "monsoon",
	"cyclone", "tempest", "beacon", "lantern", "anchor", "compass", "rover", "ranger",
}

// randIndex returns a uniform [0,n) index, falling back to 0 on the (practically
// impossible) crypto/rand failure.
func randIndex(n int) int {
	if n <= 0 {
		return 0
	}
	v, err := rand.Int(rand.Reader, big.NewInt(int64(n)))
	if err != nil {
		return 0
	}
	return int(v.Int64())
}

// GenerateSessionName returns a fresh friendly session name.
func GenerateSessionName() string {
	adj := nameAdjectives[randIndex(len(nameAdjectives))]
	noun := nameNouns[randIndex(len(nameNouns))]
	return fmt.Sprintf("%s-%s-%04d", adj, noun, randIndex(10000))
}
