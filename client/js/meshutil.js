/* BEAN BALL ARENA - client/js/meshutil.js
 * Draw-call reduction: merges static meshes that share a material look into
 * single meshes (important for iPhone / Android performance).
 *
 * Plain (untextured, opaque) materials that differ ONLY by color are merged too:
 * each part's color is baked into a vertex-color attribute, so e.g. a bean's
 * white hands, dark shoes and team-colored cap become one draw call instead of three.
 * Materials that are recolored at runtime must set material.userData.animated = true
 * so they keep their own material.
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};
  var THREE = root.THREE;

  function bakeable(m) {
    return !m.map && !m.transparent && !m.vertexColors && !(m.userData && m.userData.animated) && !!m.color;
  }

  function matKey(m, bake) {
    return [m.type, bake ? '*' : (m.color ? m.color.getHexString() : ''), m.map ? m.map.uuid : '', m.transparent, m.opacity, m.side,
      m.emissive ? m.emissive.getHexString() : '', m.emissiveIntensity, m.wireframe, m.vertexColors, m.depthWrite, m.depthTest,
      m.roughness, m.metalness, m.fog].join('|');
  }

  var vcCache = {};
  /* One shared white vertex-color twin per material look (so many characters reuse it). */
  function vertexColorTwin(m) {
    var k = matKey(m, true);
    if (vcCache[k]) return vcCache[k];
    var t = m.clone();
    t.color = new THREE.Color(0xffffff);
    t.vertexColors = true;
    t.userData = { vcTwin: true };
    vcCache[k] = t;
    return t;
  }

  /* Merge meshes under `rootObj` (skipping subtrees with userData.dynamic),
   * grouped by material look, in rootObj-local space. */
  function mergeMeshes(rootObj, minCount) {
    minCount = minCount || 2;
    rootObj.updateMatrixWorld(true);
    var inv = new THREE.Matrix4().copy(rootObj.matrixWorld).invert();
    var buckets = {}, order = [];
    rootObj.traverse(function (o) {
      if (!o.isMesh || o.isInstancedMesh || o === rootObj) return;
      var a = o;
      while (a && a !== rootObj) { if (a.userData.dynamic) return; a = a.parent; }
      if (Array.isArray(o.material) || !o.visible) return;
      var bake = bakeable(o.material);
      // shadow flags are part of the key so merging never adds new shadow casters
      var k = matKey(o.material, bake) + '|' + (o.castShadow ? 1 : 0) + (o.receiveShadow ? 1 : 0) + '|' + o.renderOrder;
      if (!buckets[k]) { buckets[k] = { mat: o.material, bake: bake, meshes: [], colors: {} }; order.push(k); }
      buckets[k].meshes.push(o);
      if (bake) buckets[k].colors[o.material.color.getHexString()] = 1;
    });
    var made = 0, i, j;
    for (i = 0; i < order.length; i++) {
      var bk = buckets[order[i]];
      if (bk.meshes.length < minCount) continue;
      // only bake colors when the bucket really mixes colors
      var useVC = bk.bake && Object.keys(bk.colors).length > 1;
      var pos = [], nor = [], uv = [], col = useVC ? [] : null, cast = false, recv = false;
      for (j = 0; j < bk.meshes.length; j++) {
        var me = bk.meshes[j];
        var geo = me.geometry.index ? me.geometry.toNonIndexed() : me.geometry.clone();
        var mtx = new THREE.Matrix4().multiplyMatrices(inv, me.matrixWorld);
        geo.applyMatrix4(mtx);
        if (!geo.attributes.normal) geo.computeVertexNormals();
        var p = geo.attributes.position.array, n = geo.attributes.normal.array;
        var u = geo.attributes.uv ? geo.attributes.uv.array : null, c;
        for (c = 0; c < p.length; c++) { pos.push(p[c]); nor.push(n[c]); }
        var vc = p.length / 3;
        if (u) { for (c = 0; c < vc * 2; c++) uv.push(u[c]); } else { for (c = 0; c < vc * 2; c++) uv.push(0); }
        if (useVC) { var mc = me.material.color; for (c = 0; c < vc; c++) col.push(mc.r, mc.g, mc.b); }
        cast = cast || me.castShadow; recv = recv || me.receiveShadow;
        geo.dispose();
      }
      var mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      mg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      mg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      if (useVC) mg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      mg.computeBoundingSphere();
      var merged = new THREE.Mesh(mg, useVC ? vertexColorTwin(bk.mat) : bk.mat);
      merged.castShadow = cast; merged.receiveShadow = recv;
      merged.renderOrder = bk.meshes[0].renderOrder;
      merged.userData.merged = true;
      rootObj.add(merged);
      for (j = 0; j < bk.meshes.length; j++) {
        var old = bk.meshes[j];
        if (old.parent) old.parent.remove(old);
        old.geometry.dispose();
      }
      made++;
    }
    // drop now-empty static groups
    var empties = [];
    rootObj.traverse(function (o) { if (o !== rootObj && o.type === 'Group' && !o.userData.dynamic && o.children.length === 0) empties.push(o); });
    for (i = 0; i < empties.length; i++) if (empties[i].parent) empties[i].parent.remove(empties[i]);
    return made;
  }

  BBA.MeshUtil = { mergeMeshes: mergeMeshes };
})(this);
