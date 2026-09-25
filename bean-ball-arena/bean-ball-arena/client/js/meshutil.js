/* BEAN BALL ARENA - client/js/meshutil.js
 * Draw-call reduction: merges static meshes that share a material look into
 * single meshes (important for iPhone / Android performance).
 */
(function (root) {
  var BBA = root.BBA = root.BBA || {};
  var THREE = root.THREE;

  function matKey(m) {
    return [m.type, m.color ? m.color.getHexString() : '', m.map ? m.map.uuid : '', m.transparent, m.opacity, m.side,
      m.emissive ? m.emissive.getHexString() : '', m.emissiveIntensity, m.wireframe, m.vertexColors, m.depthWrite, m.depthTest,
      m.roughness, m.metalness, m.fog].join('|');
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
      var k = matKey(o.material);
      if (!buckets[k]) { buckets[k] = { mat: o.material, meshes: [] }; order.push(k); }
      buckets[k].meshes.push(o);
    });
    var made = 0, i, j;
    for (i = 0; i < order.length; i++) {
      var bk = buckets[order[i]];
      if (bk.meshes.length < minCount) continue;
      var pos = [], nor = [], uv = [], cast = false, recv = false, hasColor = false;
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
        cast = cast || me.castShadow; recv = recv || me.receiveShadow;
        geo.dispose();
      }
      var mg = new THREE.BufferGeometry();
      mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      mg.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      mg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      mg.computeBoundingSphere();
      var merged = new THREE.Mesh(mg, bk.mat);
      merged.castShadow = cast; merged.receiveShadow = recv;
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
