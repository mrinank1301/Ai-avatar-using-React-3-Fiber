import { useAnimations, useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { button, useControls } from "leva";
import React, { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { useChat } from "../hooks/useChat";

// Move constants outside component to prevent recreating on each render
const FACIAL_EXPRESSIONS = {
  default: {},
  smile: {
    browInnerUp: 0.17,
    eyeSquintLeft: 0.4,
    eyeSquintRight: 0.44,
    noseSneerLeft: 0.17,
    noseSneerRight: 0.14,
    mouthPressLeft: 0.61,
    mouthPressRight: 0.41,
  },
  
};

const VISEME_MAPPING = {
  A: "viseme_PP",
  B: "viseme_kk",
  C: "viseme_I",
  D: "viseme_AA",
  E: "viseme_O",
  F: "viseme_U",
  G: "viseme_FF",
  H: "viseme_TH",
  X: "viseme_PP",
};

const MODELS = {
  AVATAR: "/models/avatar.glb",
  ANIMATIONS: "/models/animations.glb",
};

const BLINK_DURATION = 200;
const BLINK_INTERVAL = { MIN: 1000, MAX: 5000 };
const MORPH_SPEED = { DEFAULT: 0.1, FAST: 0.5 };

export function Avatar(props) {
  const { nodes, materials, scene } = useGLTF(MODELS.AVATAR);
  const { animations } = useGLTF(MODELS.ANIMATIONS);
  const { message, onMessagePlayed, chat } = useChat();
  
  const group = useRef();
  const [setupMode, setSetupMode] = useState(false);
  const [lipsync, setLipsync] = useState();
  const [audio, setAudio] = useState();
  const [blink, setBlink] = useState(false);
  const [winkLeft, setWinkLeft] = useState(false);
  const [winkRight, setWinkRight] = useState(false);
  const [facialExpression, setFacialExpression] = useState("");
  const [animation, setAnimation] = useState(() => 
    animations.find(a => a.name === "Idle")?.name || animations[0]?.name
  );

  const { actions, mixer } = useAnimations(animations, group);

  const lerpMorphTarget = useCallback((target, value, speed = MORPH_SPEED.DEFAULT) => {
    scene.traverse((child) => {
      if (!child.isSkinnedMesh || !child.morphTargetDictionary) return;

      const index = child.morphTargetDictionary[target];
      if (index === undefined || child.morphTargetInfluences[index] === undefined) return;

      child.morphTargetInfluences[index] = THREE.MathUtils.lerp(
        child.morphTargetInfluences[index],
        value,
        speed
      );

      if (!setupMode) {
        try {
          set({ [target]: value });
        } catch (e) {
          console.error('Error setting morph target:', e);
        }
      }
    });
  }, [scene, setupMode,]);

  const handleWink = useCallback((side) => {
    const setWink = side === 'left' ? setWinkLeft : setWinkRight;
    setWink(true);
    setTimeout(() => setWink(false), BLINK_DURATION);
  }, []);

  useEffect(() => {
    if (!message) {
      setAnimation("Idle");
      return;
    }

    setAnimation(message.animation);
    setFacialExpression(message.facialExpression);
    setLipsync(message.lipsync);

    const audio = new Audio("data:audio/mp3;base64," + message.audio);
    audio.addEventListener('ended', onMessagePlayed);
    audio.play();
    setAudio(audio);

    return () => audio.removeEventListener('ended', onMessagePlayed);
  }, [message, onMessagePlayed]);

  useEffect(() => {
    if (!actions[animation]) return;

    actions[animation]
      .reset()
      .fadeIn(mixer.stats.actions.inUse === 0 ? 0 : 0.5)
      .play();

    return () => actions[animation].fadeOut(0.5);
  }, [animation, actions, mixer.stats.actions.inUse]);

  useEffect(() => {
    const handleBlink = () => {
      setBlink(true);
      setTimeout(() => setBlink(false), BLINK_DURATION);
    };

    const interval = setInterval(() => {
      handleBlink();
    }, THREE.MathUtils.randInt(BLINK_INTERVAL.MIN, BLINK_INTERVAL.MAX));

    return () => clearInterval(interval);
  }, []);

  useFrame(() => {
    if (!setupMode) {
      // Handle facial expressions
      Object.keys(nodes.EyeLeft.morphTargetDictionary).forEach((key) => {
        if (key === "eyeBlinkLeft" || key === "eyeBlinkRight") return;
        
        const mapping = FACIAL_EXPRESSIONS[facialExpression];
        const targetValue = mapping?.[key] || 0;
        lerpMorphTarget(key, targetValue, MORPH_SPEED.DEFAULT);
      });
    }

    // Handle blinking
    lerpMorphTarget("eyeBlinkLeft", blink || winkLeft ? 1 : 0, MORPH_SPEED.FAST);
    lerpMorphTarget("eyeBlinkRight", blink || winkRight ? 1 : 0, MORPH_SPEED.FAST);

    // Handle lipsync
    if (!setupMode && message && lipsync && audio) {
      const currentTime = audio.currentTime;
      const activeMorphTargets = new Set();

      for (const cue of lipsync.mouthCues) {
        if (currentTime >= cue.start && currentTime <= cue.end) {
          const viseme = VISEME_MAPPING[cue.value];
          activeMorphTargets.add(viseme);
          lerpMorphTarget(viseme, 1, 0.2);
          break;
        }
      }

      // Reset unused visemes
      Object.values(VISEME_MAPPING).forEach(viseme => {
        if (!activeMorphTargets.has(viseme)) {
          lerpMorphTarget(viseme, 0, MORPH_SPEED.DEFAULT);
        }
      });
    }
  });

  useControls("FacialExpressions", {
    chat: button(() => chat()),
    winkLeft: button(() => handleWink('left')),
    winkRight: button(() => handleWink('right')),
    animation: {
      value: animation,
      options: animations.map(a => a.name),
      onChange: setAnimation
    },
    facialExpression: {
      options: Object.keys(FACIAL_EXPRESSIONS),
      onChange: setFacialExpression
    },
    enableSetupMode: button(() => setSetupMode(true)),
    disableSetupMode: button(() => setSetupMode(false)),
    logMorphTargetValues: button(() => {
      const values = Object.fromEntries(
        Object.entries(nodes.EyeLeft.morphTargetDictionary)
          .filter(([key]) => !["eyeBlinkLeft", "eyeBlinkRight"].includes(key))
          .map(([key, index]) => [
            key, 
            nodes.EyeLeft.morphTargetInfluences[index]
          ])
          .filter(([, value]) => value > 0.01)
      );
      console.log(JSON.stringify(values, null, 2));
    })
  });

  const [, set] = useControls("MorphTarget", () => 
    Object.fromEntries(
      Object.entries(nodes.EyeLeft.morphTargetDictionary).map(([key, index]) => [
        key,
        {
          label: key,
          value: 0,
          min: nodes.EyeLeft.morphTargetInfluences[index],
          max: 1,
          onChange: val => setupMode && lerpMorphTarget(key, val, 1)
        }
      ])
    )
  );

  return (
    <group ref={group} {...props} dispose={null}>
    <skinnedMesh
    name="EyeLeft"
    geometry={nodes.EyeLeft.geometry}
    material={materials.Wolf3D_Eye}
    skeleton={nodes.EyeLeft.skeleton}
    morphTargetDictionary={nodes.EyeLeft.morphTargetDictionary}
    morphTargetInfluences={nodes.EyeLeft.morphTargetInfluences}
  />
  <skinnedMesh
    name="EyeRight"
    geometry={nodes.EyeRight.geometry}
    material={materials.Wolf3D_Eye}
    skeleton={nodes.EyeRight.skeleton}
    morphTargetDictionary={nodes.EyeRight.morphTargetDictionary}
    morphTargetInfluences={nodes.EyeRight.morphTargetInfluences}
  />
  <skinnedMesh
    geometry={nodes.Wolf3D_Body.geometry}
    material={materials.Wolf3D_Body}
    skeleton={nodes.Wolf3D_Body.skeleton}
  />
  <skinnedMesh
    geometry={nodes.Wolf3D_Hair.geometry}
    material={materials.Wolf3D_Hair}
    skeleton={nodes.Wolf3D_Hair.skeleton}
  />
  <skinnedMesh
    name="Wolf3D_Head"
    geometry={nodes.Wolf3D_Head.geometry}
    material={materials.Wolf3D_Skin}
    skeleton={nodes.Wolf3D_Head.skeleton}
    morphTargetDictionary={nodes.Wolf3D_Head.morphTargetDictionary}
    morphTargetInfluences={nodes.Wolf3D_Head.morphTargetInfluences}
  />
  <skinnedMesh
    geometry={nodes.Wolf3D_Outfit_Bottom.geometry}
    material={materials.Wolf3D_Outfit_Bottom}
    skeleton={nodes.Wolf3D_Outfit_Bottom.skeleton}
  />
  <skinnedMesh
    geometry={nodes.Wolf3D_Outfit_Footwear.geometry}
    material={materials.Wolf3D_Outfit_Footwear}
    skeleton={nodes.Wolf3D_Outfit_Footwear.skeleton}
  />
  <skinnedMesh
    geometry={nodes.Wolf3D_Outfit_Top.geometry}
    material={materials.Wolf3D_Outfit_Top}
    skeleton={nodes.Wolf3D_Outfit_Top.skeleton}
  />
  <skinnedMesh
    name="Wolf3D_Teeth"
    geometry={nodes.Wolf3D_Teeth.geometry}
    material={materials.Wolf3D_Teeth}
    skeleton={nodes.Wolf3D_Teeth.skeleton}
    morphTargetDictionary={nodes.Wolf3D_Teeth.morphTargetDictionary}
    morphTargetInfluences={nodes.Wolf3D_Teeth.morphTargetInfluences}
  />
  <primitive object={nodes.Hips} />
</group>
  );
}

useGLTF.preload(MODELS.AVATAR);
useGLTF.preload(MODELS.ANIMATIONS);